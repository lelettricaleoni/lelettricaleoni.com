# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-10-05.

## Prodotto

Sito di **Lelettrica di Leoni Gabriele** — noleggio e-bike Flyer e riparazioni a Dro (TN),
Lago di Garda. Pubblico: turisti e ciclisti della zona. Oltre alle pagine vetrina ospita
una sezione di percorsi consigliati con GPX, foto, video e mappa 3D, alimentata da un
pannello di amministrazione privato.

## Ambienti

| | |
|---|---|
| Produzione | `main` → https://www.lelettricaleoni.com, deploy automatico Vercel |
| Progetto Vercel | `lelettricaleoni`, team `lelettrica` |
| Branch `staging` | ricreato il 2026-10-02 da `main` (cancellato per errore un'ora prima) per il lavoro sulle prenotazioni: la fetta 1 (con clienti e importi) è in produzione dal 2026-10-05, il resto (fette 2-5) resta qui finché non è pronto (Kevin). I suoi deploy usano l'ambiente Preview (database e bucket propri) su `staging.lelettricaleoni.com`, con `noindex`. PR verso `staging`; in produzione una sola PR `staging → main`, e solo allora la migrazione sul database vero. Protezione: `verify` e `browser`, admin inclusi; `CodeQL` da aggiungere dopo averlo visto girare qui |
| Merge | solo via PR: `verify`, `browser` e `CodeQL` devono passare, **nessuna esenzione admin** dal 2026-09-16 — chiude la falla che aveva permesso due push diretti su `main` |
| CI | `verify` (lint, tipi, unit), `browser` (Playwright contro il preview), CodeQL in default setup, suite `extended` |

## Superfici

- `app/[lang]/routes/[id]` — dettaglio percorso. L'`[id]` è uno **short id di 8 caratteri
  esadecimali** derivato dall'UUID, non lo slug: `/it/routes/aa7da601`
- `app/manage/` — pannello amministrativo, non indicizzato, protetto in `proxy.ts`
- `app/api/routes/[id]/gpx` — serve il GPX con watermark iniettato al volo; l'originale su
  R2 resta intatto

## Dati e servizi

Postgres su **Supabase** via Drizzle (schema in `lib/db/schema.ts`),
**sempre dal pooler in transaction mode** (porta 6543): `lib/db/pooler.ts` corregge la porta
anche se la variabile su Vercel dice 5432. Vedi le trappole. `npx drizzle-kit generate` e
`migrate` funzionano davvero dal 2026-09-14 (`lib/db/migrations/`): prima nessuno dei due
database aveva la tabella di tracking, storia in `_archive-2026-09-14/README.md`.
Autenticazione admin con Supabase Auth: `getAdminUser()` richiede `app_metadata.role =
'admin'` — **non** `user_metadata`, che è modificabile dall'utente stesso.
Foto, GPX, video e flussi HLS su **Cloudflare R2**.
Traduzioni IT→EN/DE generate da **Azure Translator**: l'admin scrive solo l'italiano.
Azure traduce «rifugio» con «Zuflucht» (asilo) invece di «Schutzhütte»: il tedesco di ogni percorso
con un rifugio va riletto, e una correzione a mano si perde se dal pannello si rilancia la
ritraduzione (flag `retranslate`). Visto su `bdd7a446`, lasciato com'è.

Se R2 rallenta, le card dei percorsi si degradano da sole: i media stanno in un confine
Suspense separato apposta, per non bloccare il resto della pagina.

**Cache di lettura su Upstash Redis** (`lib/cache.ts`): URL dei manifesti HLS e punti GPX
già analizzati, che non cambiano mai. Senza credenziali è un no-op, e ogni lettura fallisce
aperta entro 250 ms. Lo stesso Upstash tiene lo stato di transcodifica del worker.

**Prenotazioni (fetta 1, in produzione dal 2026-10-05).** `bike_reservations`: una riga per
bici e periodo, `ends_on` esclusivo, `EXCLUDE` su `during` per le sole righe `confirmed`, `request_key`
come chiave di idempotenza, RLS esplicito. Il vincolo non vede lo stesso noleggio inserito due volte
con due bici libere: lo coprono `request_key` e l'avviso di doppione. Una bici si ritira con
`bike_units.retired_on` (primo giorno non più offerto), mai cancellandola: la storia la referenzia; il
sito pubblico conta le bici con `inGarage()`, in SQL perché gira dentro `'use cache'`. Il campanello
Realtime parte da un trigger e non porta dati personali; il canale è pubblico, quindi i ricaricamenti
sono limitati (`lib/coalesce.ts`). Dettagli: spec e piano in `docs/superpowers/`.
**RLS e funzione `rls_auto_enable()`** (chiusi gli avvisi di Supabase, 2026-10-05): sia produzione sia sviluppo/Preview hanno
RLS su ogni tabella di `public` e l'event trigger `ensure_rls` (le tabelle nuove nascono chiuse; l'app si collega come
`postgres` e l'RLS non la tocca); la funzione non è eseguibile da `anon` né da `authenticated`, e l'event trigger scatta lo
stesso (provato su produzione con una tabella creata e annullata). Gli avvisi `rls_enabled_no_policy` (livello INFO) che
restano sono voluti: nessuna policy = tabella chiusa all'API.
**Clienti e importi.** `customers`: una riga per persona, nome e cognome obbligatori, cellulare (E.164, letto
nel paese scelto accanto al campo: `libphonenumber-js`) ed email facoltativi; stesso cellulare o stessa email
= stessa persona (indici unici), due omonimi con contatti diversi sono due clienti. Il noleggio punta al
cliente (`customer_id`, CHECK) e ha `amount_cents` (centesimi, mai float), precompilato dal listino
(`priceForDay`) e correggibile. L'incasso di un cliente è la somma dei noleggi **confermati**: annullati e
manutenzioni non contano. **L'account cliente (fetta 2) mostrerà solo le prenotazioni online**, mai quelle
inserite dal pannello (`kind` ≠ `counter_rental`), anche per la stessa persona (Kevin, 2026-10-02). Un cliente
con noleggi non si cancella.

## Infrastruttura dei media

**Tutti i media stanno su Cloudflare R2**, un bucket per ambiente (`lelettrica-trails`,
`dev-lelettrica-trails`), serviti da `trails-bucket.lelettricaleoni.com`. MinIO non esiste
più. Sorgenti in `private/route-videos/` e `private/bike-model-videos/`, flussi sotto lo stesso
percorso con `public/` al posto di `private/` (worker PR #11, provato dal vivo il 2026-10-02): **su R2 quel
`private/` non protegge nulla** — il dominio pubblico espone tutto il bucket — ma il
sorgente vive solo i minuti che il worker impiega a cancellarlo. La cache di Cloudflare su
quel dominio è attiva (`cf-cache-status: HIT`, `Age` di giorni): si legge con una GET, mai
con HEAD, che risponde `DYNAMIC`.

**Il worker** (`lelettricaleoni/videoStream-bucketWorker`) sta in `~/docker/worker` sulla VM
`clustrenode1` (Oracle Cloud, ARM64, 2 CPU), con un Redis append-only per la coda BullMQ,
nessuna porta aperta. Quattro rendition HLS (1080/720/480/360p), segmenti da 4 s allineati.

| | |
|---|---|
| Trova il lavoro | elencando R2: un sorgente senza manifesto **è** il lavoro da fare |
| Coda | BullMQ, job id = l'oggetto, tre tentativi con backoff |
| Stato per job | su Upstash, `videojob:v1:<storage-key>`, letto da `lib/video-jobs.ts` |
| Stato del worker | battito ogni 15 s su `videojob:v1:__worker__` (`heartbeat.py`), letto da `lib/worker-heartbeat.ts` per `/manage/dev` |
| Altri lavori | registro in `jobs/__init__.py`: un modulo, una riga in `HANDLERS`, per i cron una in `SCHEDULES` |

**Deploy automatico dal 2026-09-15**: ogni push a `main` con modifiche a `.py`,
`requirements.txt` o `Dockerfile` costruisce l'immagine, la fissa per digest esatto e la
distribuisce da sola sulla VM (`deploy.sh`, via una chiave SSH dedicata con comando forzato
in `authorized_keys`: non può eseguire nient'altro, verificato dal vivo). Prima di sostituire
il container, `deploy.sh` prova l'immagine a freddo (importa tutti i moduli con l'`.env`
vero) e torna indietro da sola se non parte sano.

**Foto: stessa strada dei video, coda propria** (`image-process`). Sorgenti in
`private/route-photos/` e `private/bike-model-photos/`, master AVIF in `public/…/<uuid>.avif`
più un piccolo JPEG `.share.jpg` per le anteprime social (che non leggono AVIF) e tre versioni
AVIF ridimensionate `.w480/.w960/.w1600.avif`, sempre tutte e tre (il sito sceglie con
`lib/photo-loader.ts`, mai dall'ottimizzatore di Vercel: **non ridimensiona i sorgenti AVIF**,
restituisce l'originale da 2400 px a qualunque larghezza — misurato 2026-09-25). Lo stato usa
il prefisso `videojob:` dei video perché il token del worker scrive solo lì. Le foto già
pubblicate (chiave senza `private/`) non sono mai passate dal worker e restano com'erano.
`/api/upload` è solo GPX: le foto vanno con PUT presigned e il duplicato si controlla nel
browser (spec: `docs/superpowers/specs/2026-09-23-image-processing-worker-design.md`).

La coda è **ricostruibile, non durevole**: non può esserlo più dei dati che serve, e la
verità sta nello storage.
Il token Upstash del worker può **solo `SET` su `videojob:*`** e non può leggere: rubato
dalla VM, non raggiunge le cache HLS e GPX che stanno lì accanto.

## Decisioni vincolanti, e perché

**Il locale viene dall'URL, non da un header.** `app/[lang]/layout.tsx` è il root layout
(`<html>/<body>`, GA4, consenso cookie) e legge `params.lang`, noto a build time —
`app/layout.tsx` non esiste più. Prima leggeva `x-locale` via `headers()`, il che rendeva
dinamico l'intero albero sotto.

**Cache Components (Next 16) è acceso**: lista e dettaglio percorsi cache-ano il lavoro
DB/R2 (`lib/routes-data.ts`, `"use cache"`, profilo `catalog` 10s/30s, tag `routes-list` /
`route-${id}`, invalidati da `updateTag` nelle azioni admin). **`updateTag` scade la voce
solo nell'istanza serverless che esegue l'azione**: la cache `'use cache'` di default sta in
memoria di ogni istanza, quindi le altre servono la loro copia fino a scadenza — con i
vecchi 30s/120s riordinare le bici nel pannello e ricaricare il sito poteva mostrare l'ordine
vecchio per due minuti (2026-09-25). Per questo `catalog` è corto. `getFlags()` resta fuori dalla cache —
`@flags-sdk/vercel` legge `headers()` internamente, vietato anche indirettamente in uno
scope `"use cache"` — e va preceduto da `await connection()` nella pagina: senza, durante
la build `headers()` va in timeout, `lib/flags.ts` lo intercetta (fail-open, per design) e
quel valore resta congelato nello shell statico finché non c'è un nuovo deploy — il
kill-switch smette di funzionare in silenzio, senza che la build lo segnali.

**La traccia GPX si ancora al terreno, non alla propria quota.** Le quote GPX sono
ortometriche, quelle di Cesium ellissoidiche: misurato su un percorso reale, scarto mediano
−46,3 m e dispersione 29,3 m, con il 95% dei punti sottoterra. `lib/terrain.ts` campiona la
quota del terreno sotto il tracciato e ridisegna lì traccia, marker e telecamera.

**I tile della mappa passano dal server** invece che dal browser, per non esporre la chiave
CARTO.

**Build e dev girano con `--webpack`**, non con Turbopack: `next.config.ts` mappa
`import cesium` su `window.Cesium` per evitare che SWC analizzi shader GLSL con sequenze di
escape ottali. Sotto Turbopack quella configurazione viene ignorata.

**Le pagine di servizio** (`app/[lang]/[slug]`, `lib/service-pages.ts`) **esistono solo per
essere indicizzate**: in sitemap, mai linkate da home, navbar o lista bici (Kevin, 2026-09-28:
raggiungibili da chi cerca su Google, non da chi naviga; un link tolto il giorno dopo, #185).
I contenuti nuovi per la ricerca puntano a nord di Dro (Marocche, Cavedine, Sarche, Drena,
Toblino), non ad Arco/Riva: `docs/ai/ideas/search-strategy.md`.

**I feature flag stanno su Vercel Flags**, letti da `lib/flags.ts`, che è l'unico punto da
cui passano. Il valore viene valutato una volta e riusato per 30 secondi, e un
aggiornamento avviene in sottofondo: nessuna richiesta attende il servizio. Senza questa
cache la home passava da 0,15 s a 6,2 s — misurato.

## Trappole

**Una pagina spenta risponde 200, non 404.** Le pagine percorsi hanno un `loading.tsx`,
quindi Next le trasmette in streaming e lo stato non è più modificabile quando `notFound()`
scatta. Next compensa iniettando `<meta name="robots" content="noindex">`. **Non usare il
codice HTTP per verificare se una sezione è accesa: guarda il contenuto.**

**Su Vercel i file di `public/` non sono nel pacchetto delle funzioni** (li serve la CDN):
un `readFile(process.cwd()/public/...)` in una rotta dinamica dà ENOENT. `/opengraph-image`
ha risposto 500 su tutte le pagine dal 2026-09-14 al 2026-09-25 senza che un test se ne
accorgesse. Il file va dichiarato in `outputFileTracingIncludes` (`next.config.ts`).

**Unire una PR ha quattro trappole.** (1) `gh pr merge` fallito + `git push origin --delete
<branch>` nello stesso comando **chiude la PR**: cancellare il branch solo dopo aver letto
`state=MERGED` (rimedio: ri-pushare il branch e `gh pr reopen`). (2) Subito dopo un push
`gh pr checks` mostra ancora i verdi del commit precedente e il merge fallisce: confrontare
`headRefOid` col commit dei check. (3) `git pull` si rifiuta se il journal, riscritto
dall'hook, ha modifiche non committate: `git fetch && git merge --ff-only origin/main`. (4) `gh pr edit` fallisce
senza lo scope `read:project` del token: titolo e descrizione si cambiano con
`gh api -X PATCH repos/<repo>/pulls/<n> -f title=… -f body=…`. Una PR rimasta `BEHIND` dopo altri
merge (protezione di `main` con `strict`) richiede `gh pr update-branch` e check rifatti.

**Creando un flag su Vercel, il valore predefinito è Off in produzione e preview**, On solo
in sviluppo. Creare i cinque flag ha spento la sezione percorsi in produzione senza che
nulla segnalasse errore. Dopo aver creato un flag, verificare sempre i valori per ambiente.

**Produzione e Preview usavano lo stesso database e lo stesso pooler** (copiati una volta
sola 108 giorni prima): il 2026-09-11 sei PR in test insieme hanno esaurito i quindici posti
del pooler in session mode e mandato in errore la lista percorsi in produzione, due volte.
Dal 2026-09-14 Preview ha il proprio progetto Supabase e il proprio bucket R2
(`docs/environment-variables.md`). Se un blocco simile ricapitasse: `pg_terminate_backend`
sulle sessioni `Supavisor` inattive le libera subito.

**Un client Postgres fermo per minuti ha avuto tre cause, una dopo l'altra** (2026-09-15 e
2026-09-24): `/routes`, `/manage/routes` e poi tutto `/manage` sono rimasti sullo scheletro
di caricamento fino al timeout della funzione Vercel (300 s, poi 30 s), mentre nessuna query
reale superava i pochi millisecondi (`pg_stat_statements`) e Postgres mostrava backend fermi
in `active / ClientRead`: il tempo si perdeva nel client `postgres.js`, non nel database.
(1) Con `max: 1` le richieste concorrenti sulla stessa istanza (Fluid Compute la riusa)
facevano coda senza timeout → `max: 3`. (2) Un N+1 dentro `Promise.all`
(`getRoutesListData`, `getRoutesForAdmin`) → un solo join. (3) **Il pipelining di
`postgres.js`, la causa di fondo**: di default scrive una seconda query su una connessione
ancora occupata, il pooler Supabase in transaction mode non la restituisce mai, la
connessione resta incastrata e, con tutte e tre incastrate, ogni richiesta successiva
dell'istanza aspetta dietro (la #154 portò `/manage/bike-options` da tre a quattro query e lo
fece esplodere). Misurato contro il pooler, fuori da Next: 4 e 10 query concorrenti si
bloccano, `max_pipeline: 1` non basta, **`max_pipeline: 0` risolve**
(`lib/db/client-options.ts`, con un test che lo fissa): le eccedenti aspettano nella coda del
client. Un N+1 resta uno spreco, ma non blocca più il sito.
**Prezzo di `max_pipeline: 0`: `db.transaction` non funziona più.** `postgres.js` marca la
connessione come riservata solo se `sent.length < max_pipeline`, quindi il `BEGIN` viene
rifiutato con `UNSAFE_TRANSACTION` (successo in produzione il 2026-09-25 su rinomina e
cancellazione di una categoria percorso). Un'operazione che deve essere atomica si scrive come
un solo statement (una CTE lo è già: vedi `lib/route-bike-categories.ts`);
`lib/db/no-transactions.test.ts` fa fallire la CI se qualcuno riapre una transazione sul
client condiviso.
**`statement_timeout` per connessione non funziona con questo pooler**: Supavisor in
transaction mode può dare uno statement successivo a un backend diverso da quello che ha
ricevuto il parametro di avvio (`show statement_timeout` tornava vuoto).

**`vercel env pull .env.local` distrugge le chiavi locali**, che puntano al database di
sviluppo mentre Vercel punta alla produzione. Scaricare fuori dal progetto. Quasi tutte le
variabili su Vercel sono *Secret*: escono come `[SENSITIVE]`, non si rileggono. E sempre
`npx vercel@latest`: la CLI locale è vecchia, senza `flags`, e cade in silenzio su `deploy`.

**`ECONNRESET` alla prima connessione al pooler** di un processo appena avviato: si ripete per
qualche minuto e poi si risolve da sola, anche con uno script fuori da Next, quindi non è un
bug applicativo. Attendere, non inseguire un fix.

**Un flag Vercel appena creato può impiegare ~15-20 minuti a propagarsi dopo un
`update_flag`**, anche se l'API di gestione conferma subito il nuovo valore (visto sul primo
flag, `bikes`; non è chiaro se valga per ogni flag nuovo). Se non si accende, aspettare prima
di sospettare un bug.

**Il tracking di `drizzle-kit migrate` si disallinea se si applica una migrazione a mano.**
`migrate` non confronta gli hash: legge l'ultima riga di `drizzle.__drizzle_migrations` (per
`created_at`) e riesegue ogni migrazione del journal con `when` più recente. Le migrazioni
0001–0009 erano state applicate con l'MCP `apply_migration`, che non scrive nel tracking:
`migrate` rieseguiva la 0001, la colonna esisteva già, e la CLI usciva con 1 **senza stampare
l'errore** (lo spinner lo inghiotte). Risincronizzato su dev (2026-09-24) e su produzione
(verificato il 2026-09-25: 10 righe, `created_at` = `when` del journal).
**Si applica così**: `npx drizzle-kit generate`, poi `npm run db:migrate`
(`scripts/migrate.mjs`: come `drizzle-kit migrate`, ma stampa l'errore vero) con
`DATABASE_DIRECT_URL` del database giusto — dev da `.env.local`, produzione passando la
variabile a mano. **Non usare `apply_migration` (MCP) per lo schema**; se lo si fa comunque,
registrare a mano la riga nel tracking.

**Le scrollbar globali usano i pezzi `::-webkit-scrollbar`** (sottili, senza frecce, `app/globals.css`):
`scrollbar-width`/`scrollbar-color` standard su un elemento fanno ignorare quei pezzi a Chrome 121+ e
rimettono le frecce, quindi stanno solo in `@supports not selector(::-webkit-scrollbar)` per Firefox
(guardia: `lib/scrollbar-css.test.ts`). **`SUPABASE_SERVICE_ROLE_KEY` di Preview** era sbagliata: `/manage/users` su
staging dava `AuthApiError: User not allowed` (403 `not_admin`) fino al 2026-10-05; rimessa con la chiave dello
sviluppo via CLI senza stamparla, vale solo per i deploy nuovi. **Le migrazioni 0010-0014 in produzione** sono
state applicate con `execute_sql` (la connessione diretta non è sul PC): il SQL del file più la riga in
`drizzle.__drizzle_migrations` con `hash` = sha256 del file e `created_at` = `when` del journal.

**Ogni sezione di `/manage` ha bisogno del suo `layout.tsx` con `AdminShell`**: è l'unico posto con il
`Toaster`, e senza ogni `toast.*` sparisce in silenzio (`/manage/bookings` è uscita così;
`lib/admin-layouts.test.ts` lo impone). **`npm run test:db`** gira solo contro lo sviluppo e rifiuta la
produzione. Una PR con `main` come origine non passa `browser` (nessun preview Vercel): la
sincronizzazione `main → staging` si fa da un ramo copia, con **merge commit**, mai squash.

## Debito noto

- **Video.js v10 è stabile dal 2026-10-05** (10.0.1; era RC). `components/video-player.tsx` legge `selectError` da
  `@videojs/core/dom`, un dettaglio interno: ricontrollarlo a ogni aggiornamento, con un video vero (`playlist.m3u8`
  di un percorso) e con un manifest 404. Da `localhost` il dominio dei media non risponde (CORS ammette solo `www`):
  per provarlo in locale si intercetta la risposta aggiungendo `access-control-allow-origin`.

## Decisioni passate ancora rilevanti

Una spec e un piano per feature, in `docs/superpowers/specs/` e `docs/superpowers/plans/`
(`ls` li elenca per data). Quelle che spiegano un vincolo ancora in vigore:

- `2026-09-22-flyover-elevation-chart` — profilo altimetrico nel flyover; i bordi del grafico
  sono misurati dal DOM (`.recharts-area-curve`), non stimati. Fuori scope apposta: limite
  all'area esplorabile della mappa 3D (vedi ROADMAP).
- `2026-09-21-upload-sha256` — SHA-256 su ogni file caricato; i video già trascodificati non
  ce l'hanno (il sorgente era già stato cancellato).
