# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-09-25.

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
| Branch `staging` | esiste sul remoto, non usato; protezione non allineata a `main` (solo `verify`) |
| Merge | solo via PR: `verify`, `browser` e `CodeQL` devono passare, **nessuna esenzione admin** dal 2026-09-16 — chiude la falla che aveva permesso due push diretti su `main` |
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

Postgres su **Supabase** via Drizzle (schema in `lib/db/schema.ts`),
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

**Foto: stessa strada dei video, coda propria** (`image-process`). Sorgenti in
`private/route-photos/` e `private/bike-model-photos/`, master AVIF in `public/…/<uuid>.avif`
più un piccolo JPEG `.share.jpg` per le anteprime social (che non leggono AVIF). Lo stato usa
il prefisso `videojob:` dei video perché il token del worker scrive solo lì. Le foto già
pubblicate (chiave senza `private/`) non sono mai passate dal worker e restano com'erano.
`/api/upload` è solo GPX: le foto vanno con PUT presigned e il duplicato si controlla nel
browser. Spec e correzioni: `docs/superpowers/specs/2026-09-23-image-processing-worker-design.md`
e il piano gemello.

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
dell'istanza aspetta dietro. La #154 ha portato le query di `/manage/bike-options` da tre a
quattro e l'ha fatto esplodere. Misurato contro il pooler, fuori da Next: 4 e 10 query
concorrenti si bloccano, `max_pipeline: 1` non basta, **`max_pipeline: 0` risolve**
(`lib/db/client-options.ts`, con un test che lo fissa): le eccedenti aspettano nella coda del
client. Un N+1 resta uno spreco, ma non blocca più il sito.
**Prezzo di `max_pipeline: 0`: `db.transaction` non funziona più.** `postgres.js` marca la
connessione come riservata solo se `sent.length < max_pipeline`, quindi il `BEGIN` viene
rifiutato con `UNSAFE_TRANSACTION` (successo in produzione il 2026-09-25 su rinomina e
cancellazione di una categoria percorso, subito dopo la #159). Un'operazione che deve essere
atomica si scrive come un solo statement (una CTE lo è già: vedi
`lib/route-bike-categories.ts`); `lib/db/no-transactions.test.ts` fa fallire la CI se
qualcuno riapre una transazione sul client condiviso.
**`statement_timeout` per connessione non funziona con questo pooler**: Supavisor in
transaction mode può dare uno statement successivo a un backend diverso da quello che ha
ricevuto il parametro di avvio (`show statement_timeout` tornava vuoto).

**`vercel env pull .env.local` distrugge le chiavi locali**, che puntano al database di
sviluppo mentre Vercel punta alla produzione. Scaricare fuori dal progetto. Quasi tutte le
variabili su Vercel sono *Secret*: escono come `[SENSITIVE]`, non si rileggono. E sempre
`npx vercel@latest`: la CLI locale è vecchia, senza `flags`, e cade in silenzio su `deploy`.

**La prima connessione al pooler Supabase di un processo appena avviato può dare
`ECONNRESET` a ripetizione per qualche minuto**, poi si risolve da sola non appena una
connessione va a buon fine — riprodotto sia sotto `next dev` sia con uno script isolato
fuori da Next, stesso comportamento in entrambi i casi. Sembra un problema di rete/TLS sulla
primissima connessione verso `aws-1-eu-central-1.pooler.supabase.com:6543`, non un bug
applicativo: nessuna query coinvolta era anomala. Non richiede azione — attendere, non
inseguire un fix.

**Un flag Vercel appena creato impiega ~15-20 minuti a propagarsi dopo un `update_flag`**,
anche se l'API di gestione conferma il nuovo valore istantaneamente: la valutazione live
(quella che le funzioni interrogano davvero, verosimilmente via Edge Config) resta indietro.
Il ritardo si è manifestato una sola volta, proprio sul primo flag mai creato e acceso subito
dopo (`bikes`, per farlo rivedere su un deployment preview) — non è chiaro se sia una
proprietà generale di ogni flag nuovo o una particolarità di quel primo giro. Se un flag
appena creato sembra non accendersi, prima di sospettare un bug: aspettare invece di fidarsi
della risposta immediata di `update_flag`/`get_flag`.

**Il tracking di `drizzle-kit migrate` si disallinea se si applica una migrazione a mano.**
`migrate` non confronta gli hash: legge l'ultima riga di `drizzle.__drizzle_migrations` (per
`created_at`) e riesegue ogni migrazione del journal con `when` più recente. Le migrazioni
0001–0009 erano state applicate con l'MCP `apply_migration`, che non scrive nel tracking:
`migrate` rieseguiva la 0001, la colonna esisteva già, e la CLI usciva con 1 **senza stampare
l'errore** (lo spinner lo inghiotte). Risincronizzato su dev (2026-09-24) e su produzione
(verificato il 2026-09-25: 10 righe, `created_at` = `when` del journal; gli hash calcolati su
Windows, con CRLF, non coincidono con quelli di Linux, ma non importa).
**Si applica così**: `npx drizzle-kit generate`, poi `npm run db:migrate`
(`scripts/migrate.mjs`: come `drizzle-kit migrate`, ma stampa l'errore vero) con
`DATABASE_DIRECT_URL` del database giusto — dev da `.env.local`, produzione passando la
variabile a mano. **Non usare `apply_migration` (MCP) per lo schema**; se lo si fa comunque,
registrare a mano la riga nel tracking.

## Debito noto

- **Il test browser "il tedesco rende in tedesco" (`tests/browser/content.spec.ts:85`) è
  flaky**: `locator('main')` trova due elementi invece di uno (`strict mode violation`),
  visto su almeno quattro PR indipendenti con diff completamente diversi fra loro — non è
  causato dal codice cambiato in nessuna di esse. Passa sempre al rilancio
  (`gh run rerun <id> --failed`). Probabile causa: qualcosa nell'interazione fra Cache
  Components/PPR e i worker Playwright in parallelo. Non ancora investigato a fondo — se
  ricompare ancora, merita una sessione dedicata invece dell'ennesimo rilancio.
- **I video dei modelli di bici non vengono trascodificati**: `lib/actions/bike-models.ts`
  carica su `private/bike-model-videos/...`, ma il worker (repo separato
  `videoStream-bucketWorker`) cerca sorgenti solo sotto `private/route-videos/`
  (`SOURCE_PREFIX` fisso in `jobs/transcode.py`). Non è un bug, è lavoro non ancora fatto —
  da riprendere generalizzando `SOURCE_PREFIX`/`OUTPUT_PREFIX` a una lista di coppie.

## Decisioni passate ancora rilevanti

Una spec e un piano per feature, in `docs/superpowers/specs/` e `docs/superpowers/plans/`
(`ls` li elenca per data). Quelle che spiegano un vincolo ancora in vigore:

- `2026-09-22-flyover-elevation-chart` — profilo altimetrico nel flyover; i bordi del grafico
  sono misurati dal DOM (`.recharts-area-curve`), non stimati. Fuori scope apposta: limite
  all'area esplorabile della mappa 3D (vedi ROADMAP).
- `2026-09-21-upload-sha256` — SHA-256 su ogni file caricato; i video già trascodificati non
  ce l'hanno (il sorgente era già stato cancellato).
- `2026-09-17-bike-models-and-inventory` — catalogo bici e inventario "Il mio negozio".
- `2026-09-14-routes-caching-cache-components` — cache reale su lista/dettaglio percorsi.
- `2026-09-10-tests-against-preview` — test browser contro il preview.
- `2026-09-09-ai-docs-system` — questo sistema.
