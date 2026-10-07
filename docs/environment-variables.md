# Ambienti e variabili d'ambiente

## Gli ambienti

Dal 2026-10-06 tutto gira sulla VM Oracle (vedi «Server» in `STATE.md`). Vercel è in pausa.

| Ambiente | Dove gira | Database e Auth | Media | Traffico verso servizi esterni |
|---|---|---|---|---|
| **Produzione** | `main` → `www.lelettricaleoni.com`, stack `production` sulla VM | Supabase progetto `hhfnhzdourgkinwlqvtc` | R2 `lelettrica-trails` | reale: Azure Translator, GA4, Cesium, CARTO |
| **Staging** | `staging` → `staging.lelettricaleoni.com`, stack `staging` sulla VM | Supabase progetto `wvyruunbxdqquiarhknt` (sviluppo) | R2 `dev-lelettrica-trails` | condiviso con sviluppo — vedi sotto |
| **CI** | il job `browser` di ogni pull request, sul runner di GitHub (ambiente GitHub `ci`) | come staging (sviluppo) | come staging | condiviso con sviluppo |
| **Sviluppo locale** | `npm run dev`, da `.env.local` | Supabase progetto `wvyruunbxdqquiarhknt` (sviluppo) | R2 `dev-lelettrica-trails` | condiviso con staging |

Fino al 2026-10-06 al posto di Staging e CI c'era «Preview»: il deploy che Vercel faceva per ogni pull request.

**Fino al 2026-09-14 Preview usava le stesse credenziali di Produzione** — copiate una volta
sola all'inizio del progetto e mai più separate. Il 2026-09-11 questo ha causato due blackout
in produzione: i test contro le anteprime di più pull request insieme hanno esaurito i quindici
posti del pooler condiviso (`EMAXCONNSESSION`). Ora Preview e Produzione non condividono più
database, autenticazione né bucket.

**Cosa resta condiviso fra gli ambienti, e perché va bene così**: Upstash Redis (la cache è per chiave di
storage, non per ambiente — leggere una chiave che l'altro ambiente non ha scritto fallisce aperto;
**sparirà** con il Redis unico sulla VM, vedi ROADMAP), la chiave Azure Translator, il token Cesium e la
chiave CARTO (nessuno di questi tiene dati specifici di un ambiente, solo credenziali verso un servizio a
pagamento misurato a consumo). **L'eccezione trovata il 2026-09-14**: `NEXT_PUBLIC_GA_MEASUREMENT_ID` è a sua
volta condiviso, e fino ad allora Google Analytics veniva caricato in ogni ambiente — quindi ogni esecuzione
dei test mandava eventi reali alla proprietà GA4 di produzione. Il layout ora carica GA solo quando
`APP_ENV` (o, in mancanza, `VERCEL_ENV`) vale `production`: `deploy.sh` imposta `APP_ENV` per ogni stack e
il job `browser` la imposta a `ci`.

**`CARTO_API_KEY` non era mai stata impostata su Preview**: il proxy dei tile fallisce aperto (chiama CARTO
senza chiave, funziona ma senza il piano a pagamento). Lo stack `staging` sulla VM ora ce l'ha.

**Il CORS del bucket R2 va impostato per ambiente, e non segue le variabili**: si configura sul bucket via
API Cloudflare (`PUT /accounts/{account}/r2/buckets/{bucket}/cors`), non nel codice. Il bucket di produzione
ammette `https://www.lelettricaleoni.com` e `https://staging.lelettricaleoni.com`; ogni upload diretto dal
browser (foto, GPX, video: tutti passano da un URL presigned) e ogni lettura via `fetch` (video HLS) da
un'altra origine **fallisce in silenzio nel browser**, mentre l'HTML è identico. Provandolo da un nome di
prova (`vm-www`, 2026-10-06) i media «sparivano» per questo: l'origine va aggiunta al CORS per la durata
della prova e tolta dopo.

## Dove stanno i valori

- **Segreti del server** (database, chiavi R2, service role di Supabase, Upstash, Azure, CARTO, chiave di
  cifratura, `CRON_SECRET`): **solo sulla VM**, in `~/docker/web/<ambiente>.env` (permessi 600). Mai su GitHub,
  mai in git. Modello con i soli nomi: `deploy/web/env.template`. Si modificano con
  `ssh -t clustrenode1 nano ~/docker/web/production.env` e valgono dal deploy successivo.
- **Valori pubblici `NEXT_PUBLIC_*`**: variabili degli ambienti GitHub `production`, `staging` e `ci`. Next li
  scrive nel codice **in fase di build**: cambiarli richiede una nuova immagine. Non possono essere segreti, finiscono
  comunque nel bundle del browser.
- **GitHub**: segreto `DEPLOY_SSH_KEY` (chiave che può solo lanciare `deploy.sh`), variabili `DEPLOY_HOST`,
  `DEPLOY_HOST_KEY` (impronta della VM, fissata: se cambia il deploy fallisce) e `DEPLOY_PRODUCTION` (`true` accende
  i deploy da `main`). Ambiente `ci`: cinque segreti di sviluppo (`DATABASE_URL`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `UPSTASH_REDIS_REST_TOKEN`, `CARTO_API_KEY`) più le variabili pubbliche, per il job `browser`.
- **Tunnel**: `TUNNEL_TOKEN` in `~/docker/edge/.env` sulla VM.
- **Vercel**: non più usato, progetto in pausa.

## Le variabili

| Variabile | A cosa serve | Dove si ottiene / come si ruota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto Supabase | Dashboard del progetto → Project Settings → API. Non si ruota, identifica il progetto. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica lato client | Stessa pagina. Rigenerarla in "API Keys" invalida le sessioni client esistenti. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypassa le RLS: usata dall'API admin (inviti, ruoli, blocchi) | Stessa pagina, *API Keys*. La VM usa una **chiave segreta** (`sb_secret_…`, creata col nome `oracle-vm`): si revoca da sola, senza toccare le altre. Vercel (in pausa) ha la `service_role` legacy. Mai in un `NEXT_PUBLIC_*`: una chiave segreta si rifiuta dal browser. |
| `INTEGRATIONS_ENCRYPTION_KEY` | Cifra i segreti delle integrazioni salvati nel database (la chiave JSON dell'account di servizio di Google, `lib/integrations/crypto.ts`) | **32 byte in base64**, generata a caso (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). **Preview e sviluppo locale devono avere la stessa**: usano lo stesso database, quindi la stessa riga cifrata. La produzione ne ha una sua. **Se si perde, i segreti già salvati non si leggono più** (si ricaricano dal pannello): conservarla. Non è mai nel database. Senza questa variabile il pannello rifiuta di salvare le chiavi. |
| `CRON_SECRET` | Autentica il controllo giornaliero di Google Calendar (`/api/cron/google-calendar`): `run-cron.sh` lo manda come `Authorization: Bearer …` | Una stringa casuale (`openssl rand -hex 32`), per ambiente, nel file della VM. Il timer systemd `google-calendar-check.timer` (03:00 UTC) chiama la rotta dentro il container di produzione. Senza segreto la rotta rifiuta ogni richiesta. |
| `DATABASE_URL` | Connessione runtime, dal pooler Supabase in **transaction mode** (porta 6543) | Project Settings → Database → Connection string. Il pooler di produzione è `aws-0-eu-west-1`, quello di sviluppo `aws-1-eu-central-1`. La password si ruota da lì (reset: dopo ci possono volere alcuni secondi prima che funzioni) e va riscritta nel file della VM; `lib/db/pooler.ts` corregge la porta anche se qui finisse la 5432. |
| `DATABASE_DIRECT_URL` | Connessione diretta (porta 5432), usata solo da `drizzle-kit` per le migrazioni | Stessa pagina, variante "Direct connection". |
| `CLOUDFLARE_API_TOKEN` | Statistiche di storage in `/manage/dev` (oggetti, dimensione bucket) — non serve per leggere/scrivere i file | Dashboard Cloudflare → My Profile → API Tokens → crea un token con solo "Account Analytics: Read". Diverso da `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`: quello è S3, questo è l'API GraphQL di Cloudflare. |
| `R2_ACCOUNT_ID` | ID account Cloudflare | Dashboard Cloudflare → R2 → sidebar destra. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Credenziali S3-compatibili per il bucket | Dashboard Cloudflare → R2 → Manage API tokens → crea un token scoped al bucket. La secret key **non è rileggibile dopo la creazione**: se si perde, se ne crea uno nuovo e si revoca il vecchio. |
| `R2_BUCKET_NAME` | Nome del bucket per l'ambiente corrente | Fisso per ambiente: `lelettrica-trails` (produzione) / `dev-lelettrica-trails` (sviluppo e Preview). |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | Dominio pubblico che serve il bucket | Fisso per ambiente: `trails-bucket.lelettricaleoni.com` / `dev-trails-bucket.lelettricaleoni.com`. |
| `AZURE_TRANSLATOR_KEY` | Traduzione automatica IT→EN/DE | Portale Azure → risorsa Translator → Keys and Endpoint. Due chiavi (key1/key2): si rigenera l'una tenendo l'altra attiva, poi si aggiorna qui e si rigenera la seconda. |
| `AZURE_TRANSLATOR_REGION` / `AZURE_TRANSLATOR_ENDPOINT` | Regione e endpoint della stessa risorsa | Stessa pagina. Non sono segreti, ma vanno abbinati alla chiave giusta. |
| `NEXT_PUBLIC_CESIUM_TOKEN` | Terreno 3D nel flyover dei percorsi | [ion.cesium.com](https://ion.cesium.com) → Access Tokens. Gratuito, si rigenera dalla stessa pagina. |
| `CARTO_API_KEY` | Tile della mappa 2D, usata solo server-side da `/api/map-tile` | [carto.com/basemaps/apikey](https://carto.com/basemaps/apikey), gratuita. |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics 4 | GA4 → Admin → Data Streams → Web. **Va impostata solo in produzione**, vedi sopra. |
| `NEXT_PUBLIC_MAPS_EMBED_URL` | Iframe di Google Maps nella sezione contatti | Google Maps → condividi la posizione → "Incorpora una mappa" → copia l'URL dell'`src`. |
| `NEXT_PUBLIC_SITE_URL` | Base per URL assoluti (metadata, sitemap, robots) | Fisso: `https://www.lelettricaleoni.com` in produzione; può restare assente altrove, il codice ha quel valore come fallback. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Cache di lettura (`lib/cache.ts`) e stato del worker video | Console Upstash → il database → REST API. **Condivisa fra tutti gli ambienti** di proposito. **Destinata a sparire**: con sito e worker sulla stessa VM basta il Redis della VM (ROADMAP). |
| `APP_ENV` / `APP_VERSION` | Quale ambiente è (`production`, `staging`, `ci`) e quale immagine gira | Le imposta `deploy/web/deploy.sh` (la versione è il digest dell'immagine) e il job `browser`; non vanno nei file `.env`. `/api/health` riporta la versione. |


## Impostarle

In locale: copia `.env.local.example` in `.env.local` e compila con le chiavi dell'ambiente di
**sviluppo** (Supabase `wvyruunbxdqquiarhknt`, bucket `dev-lelettrica-trails`) — mai quelle di
produzione, per non rischiare di scrivere dati di prova nel database vero.

Sulla VM: vedi «Dove stanno i valori». Le `NEXT_PUBLIC_*` si cambiano nelle variabili dell'ambiente
GitHub e valgono dal deploy successivo; i segreti nel file `.env` dell'ambiente, e si applicano rifacendo il
deploy (`gh workflow run deploy.yml --ref main`) o riavviando il container.
