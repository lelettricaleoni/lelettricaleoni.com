# Il worker in Node.js: com'è andato il passaggio, come si usa, cosa resta

> Scritto il 2026-10-07, a passaggio finito, per chi inizia una sessione nuova. Lo stato vincolante sta in `docs/ai/STATE.md`
> (sezione «Infrastruttura dei media»); qui c'è la storia, i comandi e l'elenco di ciò che manca. Spec:
> `docs/superpowers/specs/2026-10-06-node-worker-design.md`. Il piano (`docs/superpowers/plans/2026-10-06-node-worker.md`) è stato ridotto a
> ciò che resta; il testo completo dei 17 compiti è in `git show 25b5302:docs/superpowers/plans/2026-10-06-node-worker.md`.

## In breve

Il worker di video e foto, prima in Python nel repo privato `videoStream-bucketWorker`, ora sta in `worker/` (Node.js,
TypeScript, `sharp`, ffmpeg, BullMQ 5) con un solo Redis, quello della VM, al posto di Upstash. **Produzione dal 2026-10-07**
(Python fermo alle 07:08 UTC, release `staging → main` #280 con merge commit); `staging` dal 2026-10-06. Le PR: #277 (worker,
codice condiviso, immagine, CI), #278 (Redis, deploy, sito sulla nuova coda, confronto con Pillow), #279 (primo comando Redis),
#280 (release), #282 (documenti), #283 (controllo del contenuto prima del caricamento).

## Mappa del codice

| Dove | Cosa |
|---|---|
| `lib/media/keys.ts` | regole sulle chiavi dello storage, **un file solo** per sito e worker (prefissi, estensioni, master/versioni/anteprima, `RENDITION_WIDTHS`) |
| `lib/queues/` | contratto delle code (`names`, `schemas`, `options`), `addMediaJob`, stato dalla coda (`status`), accodamento che fallisce aperto (`enqueue`), panoramica per `/manage/dev` (`overview`) |
| `lib/redis.ts`, `lib/cache.ts` | connessioni al Redis della VM e cache di lettura (`cache:<ambiente>:`) |
| `lib/media-content.ts` | prima del PUT il browser legge i primi byte (`file-type`) e rifiuta ciò che non è una foto o un video |
| `worker/` | `main.ts` (avvio, arresto morbido), `runtime.ts` (code e worker), `scan.ts` (scansione), `jobs/{photo,renditions,video,target}.ts`, `imaging.ts` (`sharp`), `heic.ts` (`libheif-js`), `storage.ts` (R2), `health.ts`, `selfcheck.ts` |
| `Dockerfile.worker`, `scripts/build-worker.mjs` | immagine (node 24 + ffmpeg), pacchetto `esbuild`; `node worker.mjs --check` prova l'immagine a freddo |
| `deploy/redis/`, `deploy/worker/`, `deploy/deploy-entry.sh` | Redis (compose, conf, ACL), deploy del worker, ingresso unico della chiave SSH di deploy |
| `.github/workflows/deploy-worker.yml`, job `worker` di `ci.yml` | deploy del worker; test con Redis e ffmpeg veri |

## Come si lavora

- **Deploy**: push a `staging` o `main` (con `DEPLOY_PRODUCTION=true`) → `deploy-worker.yml` (solo se cambiano `worker/`,
  `lib/media/`, `lib/queues/`, `Dockerfile.worker`, `scripts/build-worker.mjs`, `package-lock.json`). Il nuovo container parte
  accanto al vecchio; il vecchio **finisce il lavoro in corso** e si ferma; il precedente resta fermo per `rollback`.
- **Ritorno indietro in produzione**: `ssh clustrenode1 'docker stop $(docker ps -q --filter label=lelettrica.worker=production) && cd ~/docker/worker && docker compose start video-worker'`.
  Python ha il suo `worker-redis` e la sua scansione ogni 30 s; con la `R2_BUCKETS` di `~/docker/worker/.env` ora ristretta a
  `lelettrica-trails` (backup `.env.bak-*`). Per rimettere Python anche su `dev-lelettrica-trails` va riaggiunto a mano.
- **Provare il worker senza il pannello** (così si è fatto il 2026-10-06 e 07): caricare i sorgenti su R2 con le credenziali
  che il container del sito ha già (`ssh clustrenode1 'docker exec -i $(docker ps -q --filter name=web-<ambiente>) node -' < script.js`,
  `@aws-sdk/client-s3` e `sharp` ci sono; nessun segreto va stampato), poi `docker restart` del worker di quell'ambiente
  (la scansione parte all'avvio, altrimenti attendere fino a 10 minuti), e leggere il risultato dal dominio pubblico del bucket
  (`https://dev-trails-bucket.lelettricaleoni.com/…`, `https://trails-bucket.lelettricaleoni.com/…`). Dopo, cancellare con lo
  stesso metodo (prefisso `zz-live-test`).
- **Redis**: `~/docker/redis` (`docker compose`), utenti ACL e stringhe di connessione da `render-acl.sh` (`--rotate` per cambiarle,
  poi rifare i file `.env` del sito e del worker). Il sito vede `REDIS_URL` in `~/docker/web/<ambiente>.env`, il worker in
  `~/docker/media-worker/<ambiente>.env` (`make-env.sh`). Per guardare le code: `docker exec redis redis-cli --user <utente> --pass <password> …`
  (le password stanno solo nei file `*.redis-url`, mai nei log).
- **Chiave di deploy**: `authorized_keys` ha un solo comando forzato, `~/docker/deploy-entry.sh`, che smista `deploy|rollback` al sito e
  `worker …` al worker. Copie di sicurezza: `~/.ssh/authorized_keys.bak-*`.

## Modifiche fatte fuori dal git (sulla VM, su Cloudflare, su R2)

Il codice è in git; queste no, e una sessione nuova non le vede da `git log`.

- **VM `clustrenode1`, nuovo**: `~/docker/redis/` (compose, `redis.conf`, `users.acl`, quattro file `*.redis-url` in 600; container `redis`, rete `internal`),
  `~/docker/media-worker/` (`deploy.sh`, `make-env.sh`, `staging.env`, `production.env`), `~/docker/deploy-entry.sh`. Container in esecuzione:
  `redis`, `media-worker-staging-*`, `media-worker-production-*`, `web-staging-*`, `web-production-*`, `cloudflared`; fermi o a riposo: `video-worker`
  (Python, fermo dal 2026-10-07 07:08 UTC) e `worker-redis` (acceso, del solo Python).
- **VM, modificato**: `~/docker/web/deploy.sh` (il container del sito entra nella rete `internal` se esiste) ed `env.template` copiati dal repo;
  `~/docker/web/{staging,production}.env` hanno `REDIS_URL` (utente `web-<ambiente>`); `~/.ssh/authorized_keys`: il comando forzato della chiave del sito
  è ora `~/docker/deploy-entry.sh` (copia `authorized_keys.bak-*`); `~/docker/worker/.env`: `R2_BUCKETS=lelettrica-trails` (copia `.env.bak-*`).
- **Cloudflare R2**: nel CORS del bucket `dev-lelettrica-trails` la regola `staging` (`https://staging.lelettricaleoni.com`, GET/PUT/DELETE). Il bucket
  di produzione non è cambiato (ammette `www` e `staging`).
- **R2 di produzione**: cancellati i tre PNG corrotti; gli oggetti di prova (`zz-live-test/`) creati e rimossi in entrambi i bucket.
- **GitHub**: nessuna variabile o segreto nuovo. `browser.yml` non passa più `UPSTASH_*` e `deploy.yml` e `deploy-worker.yml` distribuiscono solo da
  `staging` o da `main` con `DEPLOY_PRODUCTION=true`. Il job `worker` della CI usa un servizio Redis e installa ffmpeg.
- **Non toccati**: Upstash (ancora in piedi per il solo ripiego su Vercel), il progetto Vercel (in pausa), il database, i bucket oltre a quanto sopra.

## Provato dal vivo

- **`staging`, 2026-10-06** (sorgenti caricati su R2, scansione): JPEG con estensione maiuscola, PNG con trasparenza, HEIC,
  JPEG ruotato da EXIF (esce 200×400 da 400×200), MP4 con audio e MP4 senza audio con estensione maiuscola. Tutti con i file giusti
  sul dominio pubblico, sorgenti cancellati (404), anteprima su fondo bianco e master con trasparenza, quattro `#EXT-X-STREAM-INF`
  e segmenti da 4 s.
- **Worker ucciso a metà** (video da 150 s): ripreso e finito (38 segmenti), nessun file a metà. `kill -9` del processo: Docker lo
  riavvia (RestartCount 1). **`docker kill` no**: Docker lo tratta come arresto manuale.
- **Redis spento** (staging): il sito risponde con lo stesso contenuto (116442 e 100185 byte) e TTFB 240/230 ms contro 273/266
  con Redis acceso; dopo la riaccensione il worker torna `healthy`.
- **Produzione, 2026-10-07**: pagine `/it`, `/it/routes`, `/it/bikes`, `/en`, `/de` a 200 con i media attesi; apex → 308 a `www`; sitemap a
  93 URL (31 per lingua, uno in più del 6 ottobre per un contenuto nuovo); una foto e un video senza audio di prova elaborati e poi
  cancellati; code di Python vuote prima di fermarlo.
- **Fedeltà a Pillow** (`docs/ai/ideas/node-worker-parity.md`): 10 immagini, peso 0,92-1,15 volte, SSIM ≥ 0,9955, qualità 65 intatta.
  Il confronto ha trovato un difetto vero (canale alfa inutile nei master HEIC), corretto.

## Scelte prese fuori dal piano, e perché

- **BullMQ e ioredis fissati alla 5**: un `npm install` semplice prende la 6, con tipi diversi; la spec dice 5.
- **Un utente Redis per ruolo e per ambiente** (quattro, non due): un `staging` compromesso non deve vedere le code né la cache di
  produzione. Provato con il test vero di BullMQ sotto ogni utente e con gli accessi incrociati rifiutati.
- **Il worker non si fida dei dati del lavoro** (`worker/jobs/target.ts`): bucket solo da `R2_BUCKETS`, chiave del tipo giusto e senza
  segmenti `.`/`..` (anche in `lib/media/keys.ts`), errore senza ritentare. Tetto sui pixel di una HEIC **prima** di allocare il buffer.
- **ffmpeg con `-format_whitelist`** (`INPUT_FORMATS`): sceglie il demuxer dal contenuto, non dall'estensione. Applicato nel gestore, così
  `buildFfmpegArgs` resta identico al file «golden» generato da Python.
- **Immagine**: versioni esatte di `sharp` e `libheif-js` dal lockfile (`--ignore-scripts`); il file di salute sta in `~/healthy`, non
  in `/tmp` (CodeQL); `dist/` fuori da ESLint.
- **Redis**: il file ACL non ammette commenti (`render-acl.sh` li toglie); le connessioni accodano i comandi fino al primo `ready` e poi
  falliscono subito (prima il primo comando dopo ogni avvio falliva).
- **`deploy-worker.yml` e `deploy.yml`**: distribuiscono solo da `staging`, o da `main` con `DEPLOY_PRODUCTION=true`; prima un avvio
  manuale da un ramo qualunque poteva distribuire quel ramo su `staging`.
- **Confronto con Pillow**: il PNG piatto della prova è stato sostituito da una foto con un gradiente di trasparenza (200 byte di
  intestazioni non misurano la qualità); le soglie non si sono toccate.
- **Un solo PR per file della VM, sito e confronto** (#278) invece di due, e `main → staging` risincronizzato con un merge commit (#281).

## Cosa NON è verificato

- **Una foto HEIC vera in verticale dall'iPhone** (orientamento, profilo colore): `libheif-js` applica la rotazione del file, ma la prova è
  stata fatta solo con `worker/fixtures/sample.heic`, sintetica. Serve un file di Kevin, da tenere in `temp/` (porta le coordinate GPS).
- **La Server Action `confirmMediaUpload` dal pannello** (accodamento immediato dopo il caricamento) e la pagina **`/manage/dev`** con
  le tre code (serve il login admin): in produzione e su `staging` il worker si è sempre provato con la scansione, non con l'accodamento
  del browser. Su `staging` Kevin ha provato un caricamento, e ha funzionato.
- **Il controllo del contenuto prima del caricamento** (#283): provato con test e build, non con un file rotto nel pannello.
- **Il worker non è stato rivisto da un revisore indipendente**: la revisione finale dell'intero ramo l'ha fatta chi ha scritto il
  codice (non si sono lanciati sottoagenti), più i rilievi automatici di sicurezza e CodeQL, tutti chiusi.

## Cosa resta da fare, in ordine

1. **Provare dal pannello** (Kevin): una foto HEIC verticale dall'iPhone, un JPEG, un MP4; e un file rotto per vedere il rifiuto del #283.
   Aprire `/manage/dev` in produzione e controllare le tre code e il carico.
2. **Google Calendar** nel pannello di produzione (le chiavi di cifratura su Vercel e sulla VM sono diverse: prima non andava configurato).
3. **Ruotare i segreti comparsi in chiaro** nelle chat: password del database di produzione, token del tunnel, token `cfat_`
   (cancellarlo). Per il tunnel: `~/docker/edge/.env`.
4. **Dopo una settimana tranquilla (intorno al 2026-10-14)**: `gh repo archive lelettricaleoni/videoStream-bucketWorker`; sulla VM
   `cd ~/docker/worker && docker compose down -v` e togliere la cartella; togliere anche le chiavi di deploy di quel repo da
   `authorized_keys` (la riga con `docker/worker/deploy.sh`).
5. **Pulizia di Vercel e Upstash** dopo qualche settimana: cancellare il progetto, il database Upstash, le variabili `UPSTASH_*` (Vercel e
   VM), `vercel.json`, `VERCEL_AUTOMATION_BYPASS_SECRET`, gli ambienti GitHub «Preview» e «Production» dell'integrazione.
6. **Fetta B** (pannello): elenco dei lavori, «Riprova», pausa e ripresa di una coda, «Rielabora» per le sole foto. Serve una spec e un
   piano (brainstorming prima); la coda e `lib/queues/overview.ts` ci sono già.
7. **Facoltativo**: `docs/ai/ideas/heic-decode-spike.md` va chiuso con l'esito dell'orientamento dopo il punto 1.

Eliminati il 2026-10-07 (Kevin li aveva caricati rotti): tre PNG di 1.388.040 byte nel bucket di produzione, due in
`private/route-photos/bdd7a446-…` e uno in `private/bike-model-photos/963a0f6d-…`. Erano l'origine dell'errore di caricamento su
`bdd7a446`. Restano tre voci tra i lavori falliti di `bullmq-production`, innocue e a scadenza.
