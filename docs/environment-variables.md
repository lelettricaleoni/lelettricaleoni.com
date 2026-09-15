# Ambienti e variabili d'ambiente

## Gli ambienti

| Ambiente | Dove gira | Database e Auth | Media | Traffico verso servizi esterni |
|---|---|---|---|---|
| **Produzione** | `main` → `www.lelettricaleoni.com` | Supabase progetto `hhfnhzdourgkinwlqvtc` | R2 `lelettrica-trails` | reale: Azure Translator, GA4, Cesium, CARTO |
| **Preview** | ogni pull request, deploy automatico Vercel | Supabase progetto `wvyruunbxdqquiarhknt` (sviluppo) | R2 `dev-lelettrica-trails` | condiviso con sviluppo — vedi sotto |
| **Sviluppo locale** | `npm run dev`, da `.env.local` | Supabase progetto `wvyruunbxdqquiarhknt` (sviluppo) | R2 `dev-lelettrica-trails` | condiviso con Preview |

**Fino al 2026-09-14 Preview usava le stesse credenziali di Produzione** — copiate una volta
sola all'inizio del progetto e mai più separate. Il 2026-09-11 questo ha causato due blackout
in produzione: i test contro le anteprime di più pull request insieme hanno esaurito i quindici
posti del pooler condiviso (`EMAXCONNSESSION`). Ora Preview e Produzione non condividono più
database, autenticazione né bucket.

**Cosa resta condiviso fra Preview e Produzione, e perché va bene così**: Upstash Redis (la
cache è per chiave di storage, non per ambiente — leggere una chiave che l'altro ambiente non
ha scritto fallisce aperto), la chiave Azure Translator, il token Cesium e la chiave CARTO (nessuno
di questi tiene dati specifici di un ambiente, solo credenziali verso un servizio a pagamento
misurato a consumo). **L'eccezione trovata il 2026-09-14**: `NEXT_PUBLIC_GA_MEASUREMENT_ID` è a
sua volta condiviso, e fino ad allora Google Analytics veniva caricato in ogni ambiente — quindi
ogni esecuzione dei test contro una preview mandava eventi reali alla proprietà GA4 di
produzione. Il layout ora carica GA solo quando `VERCEL_ENV === 'production'`.

**`CARTO_API_KEY` non è mai stata impostata su Preview**: il proxy dei tile fallisce aperto
(chiama CARTO senza chiave, funziona ma senza il piano a pagamento), quindi non blocca nulla,
ma va aggiunta quando c'è occasione.

**Il CORS del bucket R2 va impostato per ambiente, e non segue le variabili**: si configura sul
bucket via API Cloudflare (`PUT /accounts/{account}/r2/buckets/{bucket}/cors`), non nel codice
né tramite Vercel. `dev-lelettrica-trails` permetteva solo `http://localhost:3000` — nessuno lo
aveva mai esposto a un'origine di preview prima del 2026-09-14 — quindi ogni upload diretto dal
browser (foto, GPX, video: tutti passano da un URL presigned) falliva in silenzio non appena
Preview ha iniziato a scrivere lì. Aggiunta la regola `https://lelettricaleoni-*-lelettrica.vercel.app`
(R2 supporta un carattere jolly nell'origine, verificato con una vera richiesta): copre ogni
deploy del progetto/team, non un `*.vercel.app` generico che accetterebbe l'origine di
qualunque altro progetto ospitato su Vercel.

L'ambiente "Development" dentro Vercel (`vercel env ls` lo elenca come terzo bersaglio insieme
a Preview e Production) non è usato: lo sviluppo locale legge `.env.local`, non quelle variabili.

## Le variabili

| Variabile | A cosa serve | Dove si ottiene / come si ruota |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto Supabase | Dashboard del progetto → Project Settings → API. Non si ruota, identifica il progetto. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave pubblica lato client | Stessa pagina. Rigenerarla in "API Keys" invalida le sessioni client esistenti. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypassa le RLS: usata dall'API admin (inviti, ruoli) | Stessa pagina, "Reset service_role secret" — **rigenerarla revoca subito quella vecchia**, coordinarsi prima di farlo in produzione. |
| `DATABASE_URL` | Connessione runtime, dal pooler Supabase in **transaction mode** (porta 6543) | Project Settings → Database → Connection string. La password si ruota da lì; `lib/db/pooler.ts` corregge la porta anche se qui finisse la 5432. |
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
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Cache di lettura (`lib/cache.ts`) e stato del worker video | Console Upstash → il database → REST API. **Condivisa fra tutti gli ambienti** di proposito: la cache è già scoped per chiave di storage, non serve separarla. |
| `FLAGS_SECRET` | Verifica le richieste all'endpoint di discovery dei feature flag | Generata automaticamente da Vercel quando si attiva Flags: non si copia da nessuna parte, non si ruota a mano. |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Solo nei secret del repository GitHub, non nelle variabili Vercel dell'app: dà ai test browser accesso alle preview protette | Vercel → Project Settings → Deployment Protection → "Protection Bypass for Automation". Mostrato una sola volta alla creazione. |
| `VERCEL_OIDC_TOKEN` | Valuta i feature flag veri in locale | `vercel env pull` **fuori dal progetto**, poi copiare solo questa riga in `.env.development.local`. Scade dopo circa 12 ore. Mai lanciare `vercel env pull .env.local`: sovrascrive il file e cancella tutte le chiavi sopra. |

## Impostarle

In locale: copia `.env.local.example` in `.env.local` e compila con le chiavi dell'ambiente di
**sviluppo** (Supabase `wvyruunbxdqquiarhknt`, bucket `dev-lelettrica-trails`) — mai quelle di
produzione, per non rischiare di scrivere dati di prova nel database vero.

Su Vercel: Project Settings → Environment Variables, tre colonne (Production / Preview /
Development, quest'ultima inutilizzata). Le variabili `NEXT_PUBLIC_*` non possono essere di tipo
Secret — Vercel lo rifiuta, dato che finiscono comunque nel bundle del client — vanno impostate
come Config.
