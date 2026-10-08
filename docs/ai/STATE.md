# Stato del progetto

> Regola di ammissione: **entra solo ciò che il codice non dice già.** Un elenco di
> componenti si ricava con `ls`; il motivo per cui i tile CARTO passano dal server no.
> Se questo file supera le ~150 righe, qualcosa è entrato che non doveva.
>
> Ultimo allineamento: 2026-10-07.

## Prodotto

Sito di **Lelettrica di Leoni Gabriele** — noleggio e-bike Flyer e riparazioni a Dro (TN),
Lago di Garda. Pubblico: turisti e ciclisti della zona. Oltre alle pagine vetrina ospita
una sezione di percorsi consigliati con GPX, foto, video e mappa 3D, alimentata da un
pannello di amministrazione privato.

## Ambienti

| | |
|---|---|
| Produzione | `main` → https://www.lelettricaleoni.com, **sulla VM Oracle dal 2026-10-06**, deploy automatico da GitHub Actions (vedi «Server») |
| Progetto Vercel | `lelettricaleoni`, team `lelettrica`, **in pausa dal 2026-10-06** (`vercel api /v1/projects/<id>/pause`, si riattiva con `/unpause`): non serve più nulla e non costruisce più. Da cancellare dopo qualche settimana tranquilla |
| Branch `staging` | ricreato il 2026-10-02 da `main` (cancellato per errore un'ora prima) per il lavoro sulle prenotazioni: la fetta 1 (con clienti e importi) è in produzione dal 2026-10-05, il resto (fette 2-5) resta qui finché non è pronto (Kevin). I suoi deploy vanno sulla VM (stack `staging`, database e bucket di sviluppo) su `staging.lelettricaleoni.com`, con `noindex`. PR verso `staging`; in produzione una sola PR `staging → main`, e solo allora la migrazione sul database vero. Protezione: `verify` e `browser`, admin inclusi; `CodeQL` da aggiungere dopo averlo visto girare qui |
| Merge | solo via PR: `verify`, `browser` e `CodeQL` devono passare, **nessuna esenzione admin** dal 2026-09-16 — chiude la falla che aveva permesso due push diretti su `main` |
| CI | `verify` (lint, tipi, unit), `browser` (costruisce l'immagine nel job e lancia Playwright su `localhost`, ambiente GitHub `ci`), CodeQL in default setup, suite `extended` |

## Server (VM Oracle, dal 2026-10-06)

`clustrenode1` (ARM64, 2 CPU, 11 GB) ospita sito e worker. **Nessuna porta aperta**: l'unico ingresso è un
**Cloudflare Tunnel** (`lelettrica-vm`, `~/docker/edge`); quale nome va a quale container si configura da Cloudflare
(tunnel gestito da remoto), non da un file. `www`, apex, `staging`, `rent` e `shop` sono dietro il tunnel; apex,
`rent` e `shop` sono **redirect 308 a `www` fatti da una regola Cloudflare** (non dal sito), e HTTPS è forzato dalla zona.
Due container web, `web-production` e `web-staging` (alias di rete `web-<env>`), con i segreti in
`~/docker/web/<env>.env` (600, mai in git, modello `deploy/web/env.template`). Dove stanno i valori:
`docs/environment-variables.md`.

**Deploy**: push a `staging` o `main` → `.github/workflows/deploy.yml` costruisce l'immagine ARM64 (azioni fissate per
SHA) e chiama `deploy/web/deploy.sh` con una chiave SSH a comando forzato. Il container nuovo parte **accanto** al
vecchio (stesso alias), il vecchio si ferma solo quando il nuovo è `healthy` e `/api/health?deep=1` risponde; il
precedente resta fermo per `deploy.sh rollback <env>`. Produzione si accende con la variabile `DEPLOY_PRODUCTION=true`.
**Cron**: il controllo di Google Calendar è un timer systemd (`google-calendar-check.timer`, 03:00 UTC) che chiama
`run-cron.sh` dentro il container.

**Capacità**: un processo Node per ambiente, quindi una CPU. Misurato il 2026-10-06 con 25 richieste in parallelo:
43 req/s sulla home, 6 sulle bici, 4 sui percorsi; da solo i tempi sono uguali a Vercel (232 contro 242 ms di primo
byte sulla home), e ffmpeg a pieno regime non li cambia. Il picco di Analytics in 90 giorni è ~0,04 req/s. Se servisse:
`pm2` in cluster (2 processi) o la cache di Cloudflare davanti alle pagine pubbliche, non altro hardware.
**Ritorno a Vercel**: riattivare il progetto, rimettere i record `www` e apex a
`CNAME 572d7e0917595668.vercel-dns-017.com` senza proxy (TTL 600) e **fermare il cron di Vercel**, che ha un'altra
chiave di cifratura. Il bucket di produzione ammette nel CORS solo `www` e `staging`.

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

**Cache di lettura sul Redis della VM** (`lib/cache.ts`, chiavi `cache:<ambiente>:`): URL dei manifesti HLS e punti GPX
già analizzati, che non cambiano mai. Senza `REDIS_URL` è un no-op, e ogni lettura fallisce aperta entro 250 ms
(provato su staging con Redis spento: stesso contenuto, stessi tempi). **Le connessioni (`lib/redis.ts`) accodano i
comandi fino al primo `ready` e dopo falliscono subito**: con `enableOfflineQueue: false` fin dall'inizio il primo
comando dopo ogni avvio falliva («Stream isn't writeable») e la prima richiesta saltava la cache.

**Prenotazioni (fetta 1, in produzione dal 2026-10-05).** `bike_reservations`: una riga per
bici e periodo, `ends_on` esclusivo, `EXCLUDE` su `during` per le sole righe `confirmed`, `request_key`
come chiave di idempotenza, RLS esplicito. Il vincolo non vede lo stesso noleggio inserito due volte
con due bici libere: lo coprono `request_key` e l'avviso di doppione. Una bici si ritira con
`bike_units.retired_on` (primo giorno non più offerto), mai cancellandola: la storia la referenzia; il
sito pubblico conta le bici con `inGarage()`, in SQL perché gira dentro `'use cache'`. Il campanello
Realtime parte da un trigger e non porta dati personali; il canale è pubblico, quindi i ricaricamenti
sono limitati (`lib/coalesce.ts`). Dettagli: spec e piano in `docs/superpowers/`.
**Integrazioni (`/manage/integrations`, 2026-10-05).** Un registro nel codice (`lib/integrations/registry.ts`), un catalogo e una pagina per
integrazione (Overview, Setup guide, Settings con la guida accanto al modulo, Activity), tutto in inglese. La tabella `integrations` ha una riga per
integrazione: impostazioni non segrete in `config`, il segreto in `secret_encrypted`, **cifrato con `jose` (A256GCM)** con la chiave di
`INTEGRATIONS_ENCRYPTION_KEY`, che sta nei segreti di Vercel e mai nel database. Il segreto si decifra solo sul server
(`lib/integrations/store.ts`) e non arriva mai al browser: la pagina riceve una vista a lista bianca (`lib/integrations/view.ts`).
Google Calendar usa un **account di servizio** (la chiave non scade; un accesso OAuth sì, e si ferma in silenzio). Si abilita solo dopo un
*Test connection* riuscito per il calendario salvato (`canEnable`). Staging e Preview usano lo stesso database dello sviluppo, quindi la
stessa riga e la stessa chiave di cifratura. Spec e piano in `docs/superpowers/`.
**Sincronizzazione con Google Calendar** (una direzione, pannello → Google): dopo ogni azione che cambia una prenotazione
(`createRentalAction`, annulla, sposta, manutenzione) e dopo la modifica di un cliente, `after()` di Next manda l'evento
**dopo** la risposta (`lib/integrations/google-calendar/sync.ts`, mai un'eccezione: se Google non risponde la prenotazione
si salva lo stesso e l'errore va in *Activity*). L'id dell'evento è l'UUID della prenotazione senza trattini: rifare l'invio non
crea doppioni. Comportamento di Google misurato dal vivo (2026-10-05): `update` su un id che non esiste dà 404 (allora `insert`);
cancellare due volte dà 410; `insert` su un id già cancellato dà 409; **`update` con `status: confirmed` su un evento cancellato lo
ripristina**. Gli eventi nostri hanno `extendedProperties.private.lelettricaManaged`, così il controllo (*Sync now* e il cron
giornaliero, finestra da ieri a un anno) non tocca mai quelli messi a mano. `lib/integrations/google-calendar/live.test.ts` prova
tutto contro il calendario vero (`LIVE_GOOGLE_CALENDAR=1`, saltato altrimenti). Nell'evento non entrano mai importo né note.
**RLS e funzione `rls_auto_enable()`** (chiusi gli avvisi di Supabase, 2026-10-05): sia produzione sia sviluppo/Preview hanno
RLS su ogni tabella di `public` e l'event trigger `ensure_rls` (le tabelle nuove nascono chiuse; l'app si collega come
`postgres` e l'RLS non la tocca); la funzione non è eseguibile da `anon` né da `authenticated`, e l'event trigger scatta lo
stesso (provato su produzione con una tabella creata e annullata). Gli avvisi `rls_enabled_no_policy` (livello INFO) che
restano sono voluti: nessuna policy = tabella chiusa all'API.
**Clienti e importi.** `customers`: una riga per persona, nome e cognome obbligatori, cellulare (E.164, letto
nel paese scelto accanto al campo: `libphonenumber-js`) ed email facoltativi; **la stessa email è la stessa persona** (indice unico), il
**cellulare no** (Kevin, 2026-10-08: una coppia o una famiglia ne condivide uno, e con l'indice unico il secondo non poteva salvarlo né prenotare):
due omonimi, o due persone con lo stesso numero, sono due clienti. Il noleggio punta al
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

**Il worker** sta in questo repository (`worker/`, immagine `Dockerfile.worker`), in Node.js e TypeScript: fino al 2026-10-07
era in Python nel repo privato `videoStream-bucketWorker` (da archiviare, non cancellare, dopo una settimana tranquilla).
Un container per ambiente, `media-worker-<ambiente>`, sulla VM; **un lavoro alla volta per coda** (due core: due lavori
insieme sarebbero più lenti, non più veloci) e ffmpeg sotto `nice`. Tre code BullMQ 5 (`video-transcode`, `image-process`,
`image-renditions`) con prefisso per ambiente `bullmq-<ambiente>`; tre tentativi con attesa esponenziale da 10 s; id del
lavoro = `bucket/chiave`, quindi un doppione lo rifiuta la coda. Quattro rendition HLS (1080/720/480/360p), segmenti da 4 s,
argomenti di ffmpeg **identici a quelli di Python** (`worker/fixtures/ffmpeg-args.golden.json`, generato dal codice
vecchio: se un parametro cambia il test fallisce). Un video **senza audio** passa: la mappa dei flussi non nomina una
traccia che non c'è (con Python ffmpeg rifiutava).

| | |
|---|---|
| Chi accoda | il browser, dopo il PUT, con la Server Action `confirmMediaUpload`; e la **scansione** del worker (all'avvio e ogni 10 minuti), che elenca R2: un sorgente senza risultato accanto **è** il lavoro da fare. Con Redis spento il caricamento non fallisce |
| Stato di un lavoro | letto dalla coda (`lib/queues/status.ts`), nessuno store a parte; l'avanzamento è validato con `zod` |
| Ordine di scrittura | foto: anteprima, versioni dalla più grande, **master per ultimo**; video: segmenti, playlist dei livelli, **`master.m3u8` per ultimo**. Il sorgente si cancella solo dopo. **Nessun originale si conserva** (Kevin, 2026-10-06: silo, bucket privato e MinIO scartati) |
| Salute | un file (`~/healthy`) rinnovato ogni 15 s finché Redis risponde, letto dall'`HEALTHCHECK` di Docker. `node worker.mjs --check` prova a freddo AVIF, ffmpeg, ffprobe e libheif e **ferma il deploy** se qualcosa manca |
| Deploy | `deploy-worker.yml` → `deploy/worker/deploy.sh`, via `deploy/deploy-entry.sh` (l'unico comando della chiave di deploy): il nuovo parte accanto al vecchio, il vecchio **finisce il lavoro in corso** e si ferma (`stop_timeout` di mezz'ora); il precedente resta fermo per `rollback` |
| Un lavoro nuovo | un `createXHandler` in `worker/jobs/`, una coda in `lib/queues/names.ts`, una riga in `worker/main.ts`; scheduler per i cron |

**Redis è uno solo** (`~/docker/redis`): rete Docker `internal` senza uscita, nessuna porta pubblicata, AOF, `noeviction`.
**Quattro utenti ACL**, uno per ruolo e per ambiente (`web-staging`, `web-production`, `worker-staging`,
`worker-production`), ciascuno solo sulle chiavi del proprio ambiente (`bullmq-<ambiente>:*`, `cache:<ambiente>:*`): un
`staging` compromesso non vede la produzione. Il vecchio `worker-redis` e Upstash restano solo finché il worker Python
non si spegne e per il ripiego su Vercel.

**Il worker non si fida dei dati di un lavoro** (arrivano da Redis): rifiuta un bucket fuori da `R2_BUCKETS` e una chiave
che non è del tipo giusto o ha segmenti `.`/`..` (`worker/jobs/target.ts`, senza ritentare), e lascia leggere a ffmpeg
solo i contenitori delle estensioni accettate (`INPUT_FORMATS`, `-format_whitelist`): ffmpeg sceglie il demuxer dal
contenuto, non dall'estensione.

**Foto: stessa strada dei video, coda propria** (`image-process`). Sorgenti in
`private/route-photos/` e `private/bike-model-photos/`, master AVIF in `public/…/<uuid>.avif`
più un piccolo JPEG `.share.jpg` per le anteprime social (che non leggono AVIF) e tre versioni
AVIF ridimensionate `.w480/.w960/.w1600.avif`, sempre tutte e tre (il sito sceglie con
`lib/photo-loader.ts`, mai dall'ottimizzatore di Vercel: **non ridimensiona i sorgenti AVIF**,
restituisce l'originale da 2400 px a qualunque larghezza — misurato 2026-09-25). **Il browser legge i primi byte di ogni file prima del PUT**
(`lib/media-content.ts`, `file-type`) e rifiuta ciò che non è una foto o un video: estensione e tipo dichiarato vengono dal nome, e tre PNG col
primo byte sovrascritto erano arrivati in produzione. Le foto già
pubblicate (chiave senza `private/`) non sono mai passate dal worker e restano com'erano.
`sharp` decodifica una volta sola; **HEIC** (iPhone) passa da `libheif-js` (WebAssembly: il `sharp` precompilato non
legge l'HEVC). Misurato contro Pillow il 2026-10-06 su 10 immagini (8 foto vere di produzione): stesse dimensioni, peso
0,92-1,15 volte, SSIM ≥ 0,9955, **qualità 65 invariata** (`docs/ai/ideas/node-worker-parity.md`; trovato e corretto un canale
alfa inutile nei master HEIC). `/api/upload` è solo GPX: le foto vanno con PUT presigned e il duplicato si controlla nel
browser (spec: `docs/superpowers/specs/2026-09-23-image-processing-worker-design.md`).

La coda è **ricostruibile, non durevole**: non può esserlo più dei dati che serve, e la
verità sta nello storage. Spec della riscrittura: `docs/superpowers/specs/2026-10-06-node-worker-design.md`; com'è andato il passaggio,
le modifiche fatte sulla VM e su Cloudflare, i comandi e ciò che resta: **`docs/ai/ideas/node-worker-cutover.md`** (il piano è ridotto a
ciò che manca).

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
vecchio per due minuti (2026-09-25). Per questo `catalog` è corto. Le pagine che leggono dati da
database e R2 (home, percorsi, bici) hanno `await connection()`: si renderizzano a ogni richiesta e
non nella build, che non ha un database; il lavoro vero lo fanno le funzioni `"use cache"` dietro.

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

**Non ci sono feature flag** (tolti il 2026-10-05, Kevin: non li usava mai). Erano sei interruttori su Vercel Flags
(percorsi, foto, video, flyover, GPX, bici), tutti accesi in produzione: spegnere una sezione ora è una modifica del codice.

## Trappole

**Un'immagine costruita senza database prepara in build tutto ciò che non legge dati dinamici.** La sitemap aveva
39 URL invece di 90 (senza percorsi né bici) finché non ha fatto `await connection()`: i `catch {}` vuoti nascondevano
la lettura fallita e il risultato restava in cache un'ora. Ogni pagina o route che legge il database deve essere
per richiesta, e un errore non va mai ingoiato dentro una funzione `"use cache"`. **Dopo ogni spostamento confronta il
contenuto con la versione precedente** (sitemap, titoli, link a bici e percorsi, riferimenti ai media), non il
codice HTTP: la differenza è venuta da lì. **Un nome di prova non ha il CORS dei media**: i video «spariscono» solo nel
browser, l'HTML è identico (vedi `docs/environment-variables.md`).

**Su Windows con Git Bash**: `ssh-keyscan` non regge lo scambio di chiavi della VM (l'impronta si legge da
`/etc/ssh/ssh_host_ed25519_key.pub` via ssh) e un argomento che inizia con `/` viene convertito in un percorso di Git:
`MSYS_NO_PATHCONV=1`. Un commento di un record DNS di Cloudflare non può superare 100 caratteri.


**Il browser carica direttamente su R2, quindi ogni nome del sito va nel CORS del bucket giusto.** Il bucket di sviluppo
non ammetteva `staging`: ogni caricamento dava «Upload failed» al volo e il server non registrava niente (il preflight dava
403 senza intestazioni). Dettagli e prova col preflight in `docs/environment-variables.md`.

**Trappole trovate dal vivo il 2026-10-06 sul worker e su Redis.** (1) `docker kill` segna il container come fermato a
mano: **Docker non lo riavvia** nemmeno con `unless-stopped`; per simulare un crash vero si uccide il processo dall'host
(`sudo kill -9 <pid>`), e allora riparte. (2) Un file ACL di Redis non ammette righe di commento: `render-acl.sh` toglie
quelle del modello, e senza Redis non parte. (3) `npm install bullmq ioredis` prende la **6**: fissate alla 5, come nella
spec (in 6 sono cambiati anche i tipi dei conteggi). (4) `worker/jobs/video.ts` lancia ffmpeg con `-format_whitelist` e
`worker/jobs/target.ts` valida bucket e chiave: non togliere i controlli per «semplificare». (5) Un worker ucciso a metà
riprende da solo, ma dopo la scadenza del blocco (due minuti), non subito. (6) Su un ritorno a Python: `docker compose start
video-worker` in `~/docker/worker` e fermare il worker Node di quell'ambiente; Python ha una sua scansione ogni 30 s.

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
`npx vercel@latest`: la CLI locale è vecchia e cade in silenzio su `deploy`.

**`ECONNRESET` alla prima connessione al pooler** di un processo appena avviato: si ripete per
qualche minuto e poi si risolve da sola, anche con uno script fuori da Next, quindi non è un
bug applicativo. Attendere, non inseguire un fix.

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
