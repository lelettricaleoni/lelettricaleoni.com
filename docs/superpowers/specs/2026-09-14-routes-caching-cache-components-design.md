# Design Spec — Cache reale per le pagine pubbliche, con Cache Components

**Data**: 2026-09-14
**Stato**: approvato, non implementato
**Rapporto con `feat/routes-caching`**: quel ramo è abbandonato e troppo indietro rispetto a
`main` per essere ripreso (precede il pannello admin, la baseline drizzle, `.githooks/`,
Dependabot). Ne resta l'idea giusta — spostare il locale dall'header all'URL — ma qui viene
rifatta da zero sopra Cache Components invece che con `export const revalidate`, e con
invalidazione mirata invece che solo a tempo.

---

## Perché questa spec esiste

`export const revalidate = 3600` sulla lista percorsi non ha mai avuto effetto:
`app/layout.tsx` legge `x-locale` con `await headers()`, e questo rende dinamico l'intero
albero sotto — ogni visita interroga Supabase e scarica il GPX da R2, anche quando niente è
cambiato. `next build` marca ogni rotta `ƒ` (dinamica).

Kevin ha chiesto di riprendere il lavoro, ma **migliorato**: Next 16.3.4 include già Cache
Components (`cacheComponents` in `next.config.ts`), il meccanismo che sostituisce
`revalidate`/`fetchCache` con `"use cache"` + `cacheLife`/`cacheTag`, e supporta
invalidazione mirata via `updateTag()` da una Server Action — cosa che `export const
revalidate` da solo non può fare. Kevin ha confermato che gli serve: quando pubblica o
modifica un percorso dal pannello, si aspetta di vederlo subito sul sito pubblico, non entro
un'ora.

## Cosa NON è in scope

**Solo la parte pubblica del sito** — home, lista percorsi, dettaglio percorso, privacy.
L'area admin (`/manage/**`) è privata, dipende da cookie di sessione per ogni richiesta e
non ha nulla da guadagnare dalla cache: resta interamente dinamica, non convertita.
`/login` e `/update-password` restano dinamiche per lo stesso motivo (dipendono da sessione
e da `searchParams` per gli errori del form).

---

## 1. Il locale esce da `headers()`

`cacheComponents` tratta `headers()` fuori da un `Suspense` come "blocking": la build fallisce
per ogni pagina che lo fa, non solo per la sezione percorsi. Quindi questo passo è
obbligatorio per accendere il flag, non solo utile per la cache.

**Cambio**: `<html>`/`<body>` (font, GA4, consenso cookie, JSON-LD LocalBusiness) si
spostano da `app/layout.tsx` a `app/[lang]/layout.tsx`, che riceve il locale da
`params.lang` — noto a build time via `generateStaticParams`, non da un header letto a
runtime. È il pattern che la stessa documentazione Next consiglia per l'i18n
(`node_modules/next/dist/docs/01-app/02-guides/internationalization.md`).

Conseguenze meccaniche, non di comportamento:

- `app/layout.tsx` viene eliminato. Serve `app/global-not-found.tsx` (convenzione Next 16
  per un 404 fuori da ogni `[lang]`, con il proprio `<html>/<body>`).
- **`app/manage/layout.tsx` deve guadagnare il proprio `<html>/<body>`** — oggi lo eredita
  dal root layout che stiamo rimuovendo. Nessun cambio di comportamento: resta dinamico,
  cookie compresi. È collaterale meccanico del restructuring, non del caching.
- Da verificare durante l'implementazione, non deciso qui: `app/login/*` (fuori da
  `[lang]`, tre file) sembra irraggiungibile — il matcher di `proxy.ts` non lo esclude dal
  redirect i18n, quindi ogni richiesta a `/login` diventa `/{locale}/login` prima che Next
  possa servire quella pagina. Idem `app/manage/login/page.tsx`, che il blocco admin di
  `proxy.ts` protegge con lo stesso controllo di sessione che dovrebbe far arrivare lì
  chi non è loggato — un cortocircuito. Se la verifica conferma che sono morti, si tolgono;
  altrimenti restano com'erano, `instant = false`, fuori da questo giro.

## 2. Il conflitto fra flag e cache

`getFlags()` non legge `cookies()`/`headers()` — è una chiamata di rete con una cache in
memoria di 30s già pensata per essere veloce e fail-open (`lib/flags.ts`). Sotto Cache
Components è comunque IO non cache-ato: va dentro `"use cache"` o dietro `Suspense`.
`Suspense` non va bene qui — il flag decide `notFound()` per l'**intera** pagina (kill
switch), non per un pezzo, e non si può prerenderizzare uno scheletro intorno a un
`notFound()` che potrebbe cancellare tutto.

**Soluzione**: `getFlags()` entra **nella stessa** funzione `"use cache"` che legge dal DB,
non in una sua. Una funzione per pagina:

- `getRoutesListData(lang)` — flags + percorsi pubblicati + traduzioni, per la lista.
- `getRouteDetailData(lang, id)` — flags + percorso + traduzione + foto (senza risolvere
  l'URL HLS, vedi sotto), per il dettaglio.

`cacheLife`: un profilo custom da **~30 secondi** — lo stesso ordine di grandezza della
cache interna di `getFlags()`, per non peggiorare la velocità con cui un kill-switch
raggiunge i visitatori rispetto a oggi.

Il confine `Suspense` per-card che già isola le chiamate a R2 (foto/video/mappa GPX, che si
degradano da sole se R2 è lento — `RouteCardMediaAsync`) **resta fuori** da `"use cache"` e
dinamico com'è oggi: è già il pattern giusto, Cache Components lo formalizza soltanto.
Stesso discorso per `resolveHlsUrl` nel dettaglio: la sua stessa cache Upstash esiste
apposta per non ribloccare il rendering, non ha senso raddoppiarla dentro `"use cache"`.

## 3. Invalidazione sulla pubblicazione

`cacheTag('routes-list')` sulla funzione della lista; `cacheTag(\`route-${id}\`)` su quella
di dettaglio (`id` è lo short id a 8 caratteri, non l'UUID — coerente con come la pagina è
già indirizzata).

`lib/actions/routes.ts` chiama già `revalidatePath('/[lang]/routes', ...)` in
`createRouteAction`, `updateRouteAction`, `deleteRouteAction`, `togglePublishAction`,
`savePhotosAction` — oggi inutile per lo stesso motivo per cui lo era `revalidate`, ma il
punto di innesto è già lì. Ogni chiamata diventa (o si affianca a — `revalidatePath`
resta valido sotto Cache Components) `updateTag('routes-list')`, più
`updateTag(\`route-${shortRouteId(id)}\`)` dove la funzione conosce già l'id del percorso
toccato. `updateTag` funziona solo da una Server Action: tutti questi punti lo sono già
(`'use server'` in testa al file).

## 4. Home page

`app/[lang]/page.tsx` chiama `getFlags()` per decidere se mostrare
`RoutesTeaserSection` (che non legge dal DB — solo un link statico a `/routes`). Stessa
soluzione del punto 2, funzione dedicata più piccola: `getHomeFlags(lang)` con lo stesso
`cacheLife` da ~30s. Nessun `cacheTag` di contenuto serve qui, perché la teaser non mostra
dati dei percorsi.

## 5. Rollout incrementale, a rischio contenuto

`cacheComponents: true` è un flag globale: una volta acceso, ogni pagina con IO non
cache-ato fuori da `Suspense` fa fallire la build finché non viene convertita o marcata
`instant = false` — l'opt-out esplicito che Next stesso raccomanda per l'adozione
incrementale.

Piano:

1. Accendere il flag, rimuovere `export const revalidate` (diventa errore sotto Cache
   Components).
2. Marcare `instant = false` su tutto `app/` (codemod
   `cache-components-instant-false`), così la build torna verde subito.
3. Convertire, togliendo `instant = false`, nell'ordine: `app/[lang]/layout.tsx` (che
   assorbe il root layout, punto 1) → home → lista percorsi → dettaglio percorso.
   `privacy` resta `instant = false` per ora (nessun dato dinamico, ma nessun guadagno a
   convertirla in questo giro — pagina statica già veloce).
4. `generateStaticParams` su `app/[lang]/layout.tsx` deve restituire almeno un locale (non
   più `[]`: sotto Cache Components un array vuoto fa fallire la build). I tre locali sono
   già noti staticamente (`it`, `en`, `de`), quindi li restituisce tutti.
5. `params` nella pagina di dettaglio (`[id]`) va passato dentro `Suspense` invece che
   atteso in testa al componente, perché gli id dei percorsi non sono in
   `generateStaticParams` (non ce l'ha, e non è in scope aggiungerlo) — la pagina prerenderizza
   uno scheletro e i dati specifici del percorso arrivano a richiesta.

## Misurare, non solo far passare la build

Regola del progetto: una migrazione "verificata" ha già reso la home 40 volte più lenta una
volta, perché la verifica guardava solo la correttezza. Prima/dopo, misurati sullo stesso
ambiente (preview o produzione, non locale):

- Tempo di risposta di `/it/routes` e `/it` a freddo e a caldo.
- Conferma che `next build` marca le rotte convertite come prerenderizzate (non più `ƒ`).
- Un kill-switch (flag `routes` spento da dashboard) raggiunge `/it/routes` entro lo stesso
  ordine di grandezza di oggi (~30s), non entro il `cacheLife` di una pagina che non lo
  contiene più esplicitamente.
- Pubblicare/modificare un percorso dal pannello lo aggiorna sul sito pubblico alla
  richiesta successiva, non alla prossima scadenza della cache.

## Rischi noti, non bloccanti

- **`resolveHlsUrl` e `loadGpxPoints` restano IO non cache-ato dentro pagine ora
  prerenderizzate**: per il dettaglio percorso, questo è voluto (punto 2) ma va verificato
  che Cache Components non li tratti come "blocking" nonostante siano fuori dalla funzione
  `"use cache"` — se lo fa, vanno esplicitamente dietro un `Suspense` proprio, non dentro la
  cache.
- **Due login/`app/login` e `app/manage/login`** possibilmente morti (punto 1): va
  verificato, non assunto, prima di toccarli.
- **`RouteFilters`** (filtri lato client sulla lista) non è stato riletto in dettaglio: va
  verificato che non dipenda da `searchParams` in un modo che romperebbe il prerendering
  della lista.
