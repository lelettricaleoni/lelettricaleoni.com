# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-09-16.

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
| Branch `staging` | esiste sul remoto, protetto come `main` |
| Merge | solo via PR: il controllo `verify` deve passare (amministratori esenti) |
| CI | `verify` (lint, tipi, unit), `browser` (Playwright contro il preview), CodeQL in default setup, suite `extended` |

## Superfici

- `app/[lang]/` — home, privacy, login, update-password, e la sezione `routes`
- `app/[lang]/routes/[id]` — dettaglio percorso. L'`[id]` è uno **short id di 8 caratteri
  esadecimali** derivato dall'UUID, non lo slug: `/it/routes/aa7da601`
- `app/manage/` — pannello amministrativo, non indicizzato, protetto in `proxy.ts`
- `app/api/routes/[id]/gpx` — serve il GPX con watermark iniettato al volo; l'originale su
  R2 resta intatto
- `app/api/map-tile/[z]/[x]/[y]` — proxy server-side dei tile CARTO
- `app/.well-known/vercel/flags` — discovery endpoint dei feature flag

## Dati e servizi

Postgres su **Supabase** via Drizzle (`routes`, `route_translations`, `route_photos`),
**sempre dal pooler in transaction mode** (porta 6543): `lib/db/pooler.ts` corregge la porta
anche se la variabile su Vercel dice 5432. Vedi le trappole. `npx drizzle-kit generate` e
`migrate` funzionano davvero dal 2026-09-14 (`lib/db/migrations/`): prima nessuno dei due
database aveva la tabella di tracking, storia in `_archive-2026-09-14/README.md`.
Autenticazione admin con Supabase Auth: `getAdminUser()` richiede `app_metadata.role =
'admin'` — **non** `user_metadata`, che è modificabile dall'utente stesso.
Foto, GPX, video e flussi HLS su **Cloudflare R2**.
Traduzioni IT→EN/DE generate da **Azure Translator**: l'admin scrive solo l'italiano.

Se R2 rallenta, le card dei percorsi si degradano da sole: i media stanno in un confine
Suspense separato apposta, per non bloccare il resto della pagina.

**Cache di lettura su Upstash Redis** (`lib/cache.ts`): URL dei manifesti HLS e punti GPX
già analizzati, che non cambiano mai. Senza credenziali è un no-op, e ogni lettura fallisce
aperta entro 250 ms. Lo stesso Upstash tiene lo stato di transcodifica del worker.

## Infrastruttura dei media

**Tutti i media stanno su Cloudflare R2**, un bucket per ambiente (`lelettrica-trails`,
`dev-lelettrica-trails`), serviti da `trails-bucket.lelettricaleoni.com`. MinIO non esiste
più. Sorgenti in `private/route-videos/`, flussi in `public/route-videos/`: **su R2 quel
`private/` non protegge nulla** — il dominio pubblico espone tutto il bucket — ma il
sorgente vive solo i minuti che il worker impiega a cancellarlo.

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
in `authorized_keys` — non può eseguire nient'altro). Prima di sostituire il container in
esecuzione, `deploy.sh` prova l'immagine a freddo (importa tutti i moduli con l'`.env` vero)
e torna indietro da sola se il container non parte sano. Verificato dal vivo: un comando
arbitrario passato attraverso quella chiave non viene eseguito, resta testo inerte per
`deploy.sh`.

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
DB/R2 (`lib/routes-data.ts`, `"use cache"`, ~30s, tag `routes-list` / `route-${id}`,
invalidati da `updateTag` nelle azioni admin). `getFlags()` resta fuori dalla cache —
`@flags-sdk/vercel` legge `headers()` internamente, vietato anche indirettamente in uno
scope `"use cache"` — e va preceduto da `await connection()` nella pagina: senza, durante
la build `headers()` va in timeout, `lib/flags.ts` lo intercetta (fail-open, per design) e
quel valore resta congelato nello shell statico finché non c'è un nuovo deploy — il
kill-switch smette di funzionare in silenzio, senza che la build lo segnali.

**La traccia GPX si ancora al terreno, non alla propria quota.** Le quote GPX sono
ortometriche, quelle di Cesium ellissoidiche: misurato su un percorso reale, scarto mediano
−46,3 m e dispersione 29,3 m, con il 95% dei punti sottoterra. `lib/terrain.ts` campiona la
quota del terreno sotto il tracciato e ridisegna lì traccia, marker e telecamera.

**Cesium è self-hosted** in `public/cesium/`, copiato da `scripts/copy-cesium.mjs` a ogni
`dev` e `build`. Non è versionato.

**I tile della mappa passano dal server** invece che dal browser, per non esporre la chiave
CARTO.

**Build e dev girano con `--webpack`**, non con Turbopack: `next.config.ts` mappa
`import cesium` su `window.Cesium` per evitare che SWC analizzi shader GLSL con sequenze di
escape ottali. Sotto Turbopack quella configurazione viene ignorata.

**I feature flag stanno su Vercel Flags**, letti da `lib/flags.ts`, che è l'unico punto da
cui passano. Il valore viene valutato una volta e riusato per 30 secondi, e un
aggiornamento avviene in sottofondo: nessuna richiesta attende il servizio. Senza questa
cache la home passava da 0,15 s a 6,2 s — misurato.

## Trappole

**Una pagina spenta risponde 200, non 404.** Le pagine percorsi hanno un `loading.tsx`,
quindi Next le trasmette in streaming e lo stato non è più modificabile quando `notFound()`
scatta. Next compensa iniettando `<meta name="robots" content="noindex">`. **Non usare il
codice HTTP per verificare se una sezione è accesa: guarda il contenuto.**

**Creando un flag su Vercel, il valore predefinito è Off in produzione e preview**, On solo
in sviluppo. Creare i cinque flag ha spento la sezione percorsi in produzione senza che
nulla segnalasse errore. Dopo aver creato un flag, verificare sempre i valori per ambiente.

**Produzione e Preview usavano lo stesso database e lo stesso pooler**, copiati una volta sola
108 giorni prima e mai più separati: il 2026-09-11 sei PR in test insieme hanno esaurito i
quindici posti del pooler in session mode e mandato in errore la lista percorsi in produzione,
due volte. Dal 2026-09-14 Preview ha il proprio progetto Supabase e il proprio bucket R2 —
dettagli in `docs/environment-variables.md`. Se un blocco simile ricapitasse (stessa causa,
ambiente diverso): `pg_terminate_backend` sulle sessioni `Supavisor` inattive le libera subito.

**`max: 1` sul client Postgres non basta a evitare un blocco di cinque minuti.** Il
2026-09-15 `/routes` e `/manage/routes` sono rimasti bloccati sullo scheletro di
caricamento per 300 secondi — il timeout della funzione Vercel, non del database: la
produzione applica già `statement_timeout = 2min` a livello di database, e nessuna query
reale supera i pochi millisecondi (verificato in `pg_stat_statements`). Il tempo veniva
speso in coda nel client `postgres.js`, in attesa dell'unica connessione che `max: 1`
concedeva — Fluid Compute riusa la stessa istanza fra richieste concorrenti, e le
revalidation in sottofondo di Cache Components possono partire in gruppo dalla stessa
istanza. Quella coda lato client non ha un proprio timeout. Alzato a `max: 3` in
`lib/db/index.ts`. **`statement_timeout` per connessione non funziona con questo pooler**:
Supavisor in transaction mode può assegnare a uno statement successivo un backend diverso
da quello che ha ricevuto il parametro di avvio — verificato con `show statement_timeout`
subito dopo la connessione, tornava vuoto.

Quel `max: 3` non è bastato: `/routes` si è bloccato altre due volte lo stesso giorno,
tracciato stavolta in diretta con `pg_stat_activity` — backend fermi in `ClientRead` per
minuti, cioè Postgres aveva già finito e il client non leggeva il risultato. Causa reale:
`getRoutesListData` interrogava le traduzioni **una query per percorso** dentro un
`Promise.all` — sette percorsi pubblicati, sette query concorrenti contro tre sole
connessioni, a ogni rigenerazione di quella cache. Risolto con una singola query a join
(`routes` × `route_translations` su `locale`). Mitigato dal vivo con
`pg_terminate_backend`, ma quella è la toppa, non la cura: un N+1 dentro `Promise.all` va
cercato per primo, prima di alzare `max`.

**`vercel env pull .env.local` distrugge le chiavi locali**, che puntano al database di
sviluppo mentre Vercel punta alla produzione. Scaricare fuori dal progetto. Quasi tutte le
variabili su Vercel sono *Secret*: escono come `[SENSITIVE]`, non si rileggono. E sempre
`npx vercel@latest`: la CLI locale è vecchia, senza `flags`, e cade in silenzio su `deploy`.

## Debito noto

- **Le PR npm di Dependabot hanno il lockfile rotto**: il suo npm 11 toglie l'`esbuild`
  opzionale di vite, che `npm ci` con npm 10 (Node 22, in CI) poi rifiuta. Non superano
  nemmeno davvero il check `browser`: senza i secret il workflow si salta da solo e
  riporta successo, quindi un verde lì non prova che i test abbiano girato.

## Decisioni passate ancora rilevanti

- `docs/superpowers/specs/2026-09-14-routes-caching-cache-components-design.md` — cache
  reale su lista/dettaglio percorsi
- `docs/superpowers/specs/2026-09-09-ai-docs-system-design.md` — questo sistema
- `docs/superpowers/specs/2026-09-10-tests-against-preview-design.md` — test browser contro
  il preview: geometria, contenuto, budget di prestazione
- `docs/superpowers/specs/2026-05-29-percorsi-admin-design.md` — sezione percorsi e admin
- `docs/superpowers/plans/2026-05-29-route-detail-redesign.md` — flyover 3D e bento grid
