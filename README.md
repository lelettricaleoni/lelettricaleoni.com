# Lelettrica — lelettricaleoni.com

Sito web per **Lelettrica di Leoni Gabriele**, noleggio e-bike Flyer e riparazioni bici a Dro
(TN), sul Lago di Garda. Oltre alle pagine vetrina ospita una sezione di percorsi consigliati
con GPX, foto, video e mappa 3D, alimentata da un pannello di amministrazione privato.

> Per lo stato del progetto, le decisioni vincolanti e le trappole già pagate, vedi
> [`docs/ai/STATE.md`](docs/ai/STATE.md) — quel documento è la fonte di verità operativa,
> pensato per chi (umano o assistente) lavora sul codice ogni giorno. Questo file resta un
> punto di partenza per chi arriva la prima volta.

## Stack

| Tecnologia | Note |
|---|---|
| Next.js App Router | 16, con Cache Components (`"use cache"`, Partial Prerendering) |
| React | 19 |
| TypeScript | — |
| Tailwind CSS | v4 |
| shadcn/ui | — |
| Drizzle ORM | Postgres su Supabase, via il pooler in transaction mode |
| Supabase | Auth + Postgres — progetti separati per sviluppo/preview e produzione |
| Cloudflare R2 | Foto, GPX, sorgenti e flussi video (HLS) |
| hls.js | Player video adattivo lato client |
| Cesium | Terreno 3D per il flyover dei percorsi, self-hosted in `public/cesium/` |
| Vercel Flags | Feature flag per sezione, letti da `lib/flags.ts` |
| Upstash Redis | Cache di lettura + stato del worker video |
| Azure Translator | Traduzione automatica IT→EN/DE dei percorsi |

Il worker di transcodifica video (`lelettricaleoni/videoStream-bucketWorker`) è un repository
separato: gira su una VM Oracle Cloud, si distribuisce da solo a ogni push, e non ha porte
aperte — parla solo verso R2, Upstash e GHCR.

## Funzionalità

- **i18n nativo** — IT / EN / DE, locale ricavato dall'URL (`app/[lang]/`), dizionari in `messages/`
- **SEO** — JSON-LD, hreflang, sitemap dinamica, `robots.txt`
- **GDPR** — cookie consent via `vanilla-cookieconsent`; GA4 caricato solo dopo consenso
- **Sezione percorsi** — lista e dettaglio, filtri, galleria foto/video, mappa 2D e flyover 3D,
  download GPX con watermark iniettato al volo
- **Video** — upload, transcodifica adattiva in quattro rendition HLS (1080/720/480/360p),
  player che parte sempre dalla qualità più bassa disponibile
- **Feature flag** — ogni sezione dei percorsi si può spegnere dalla dashboard di Vercel senza
  un nuovo deploy
- **Pannello admin** (`/manage`) — CRUD percorsi, gestione utenti, e una pagina diagnostica
  (`/manage/dev`, dietro un permesso dedicato) con lo stato del worker, di Redis e del database

## Percorsi consigliati (`/[lang]/routes`)

- **Lista** (`/[lang]/routes`) — card con foto o video in autoplay, statistiche, filtri;
  un percorso può restare raggiungibile via link diretto senza comparire qui ("nascosto dalla
  lista", distinto da "non pubblicato", che lo toglie ovunque)
- **Dettaglio** (`/[lang]/routes/[id]`) — l'`id` nell'URL è uno **short id di 8 caratteri
  esadecimali** derivato dall'UUID, non lo slug: `/it/routes/aa7da601`. Statistiche, galleria
  con lightbox, link Strava/Komoot, download GPX, flyover 3D su terreno reale
- **Cache** — il lavoro su database e R2 è cache-ato con Cache Components
  (`lib/routes-data.ts`); i feature flag restano fuori dalla cache e si leggono a ogni
  richiesta
- **GPX watermark** — il file originale su R2 resta intatto; il watermark con i dati di
  Lelettrica viene iniettato al volo al download, via `/api/routes/[id]/gpx`

## Pannello admin (`/manage`)

URL non indicizzato, protetto in `proxy.ts`.

### Accesso

Vai su `/manage` — se non sei autenticato vieni reindirizzato a `/manage/login`. Le
credenziali sono quelle di un account Supabase Auth con **`app_metadata.role = 'admin'`**
— non `user_metadata`, che è modificabile dall'account stesso e quindi non fidato. Il primo
amministratore va impostato dalla dashboard di Supabase (Authentication → Users → modifica
`raw_app_meta_data`); da lì in poi si gestisce da `/manage/users` nel pannello stesso.

### Gestione percorsi

Dalla sidebar, **Routes**:

- **Nuovo percorso** — nome e descrizione in italiano; le traduzioni EN/DE vengono generate
  automaticamente da Azure Translator
- **Modifica** — aggiorna qualsiasi campo; le traduzioni si rigenerano quando il testo
  italiano cambia
- **Pubblica / Nascondi** — toglie il percorso ovunque, link diretto incluso
- **Nascondi dalla lista** — resta raggiungibile via link diretto, ma esce dalla lista
  pubblica e dalla sitemap
- **Elimina** — rimuove il percorso, le foto, il video e il GPX da R2

Foto e GPX si caricano tramite presigned URL, direttamente verso R2 senza passare dal
server. Il video innesca la transcodifica sul worker; lo stato di avanzamento si legge in
tempo reale dal pannello.

### Pagina sviluppo (`/manage/dev`)

Visibile solo a chi ha il permesso `canViewDevTools` (indipendente dal ruolo admin,
assegnabile da `/manage/users`). Mostra lo stato del worker video (coda, job in corso, carico
della macchina), i cron job registrati, e statistiche di Redis, Postgres e dello storage R2.

## Struttura

```
app/
  [lang]/
    layout.tsx              # <html>/<body>, GA4, cookie consent, JSON-LD
    page.tsx                # Home
    privacy/, login/, update-password/
    routes/
      page.tsx               # Lista percorsi pubblica
      [id]/page.tsx           # Dettaglio percorso
  manage/                   # Pannello admin, non indicizzato
    (home)/page.tsx
    login/, update-password/
    routes/                  # CRUD percorsi
    users/                   # Gestione accessi e permessi
    dev/                     # Diagnostica (worker, Redis, Postgres, R2)
  api/
    routes/[id]/gpx/         # GPX con watermark iniettato al volo
    map-tile/[z]/[x]/[y]/    # Proxy dei tile della mappa
    upload/
  .well-known/vercel/flags/  # Discovery endpoint dei feature flag
  sitemap.ts / robots.ts

components/
  route-card.tsx, route-card-media.tsx, route-gallery.tsx, route-flyover.tsx
  media-placeholder.tsx      # Segnaposto unificato: media assenti o in caricamento
  video-player.tsx
  admin/                    # Componenti del pannello (form, upload, liste, sidebar)

lib/
  db/
    schema.ts                # routes, route_translations, route_photos
    index.ts                 # Client Drizzle (pooler transaction mode)
    migrations/
  supabase/                 # Client server/browser, getAdminUser()
  actions/                  # Server Actions: routes, auth, users, translate
  routes-data.ts             # Query cache-ate (Cache Components) per lista/dettaglio
  media.ts, media-client.ts  # Risoluzione manifesti HLS, presigned URL
  video-jobs.ts               # Stato per-job del worker (da Upstash)
  worker-heartbeat.ts          # Stato aggregato del worker (da Upstash)
  dev-stats.ts                # Statistiche Redis/Postgres/R2 per /manage/dev
  flags.ts                    # Feature flag, cache e fallback
  cache.ts                    # Cache di lettura su Upstash
  terrain.ts, route-gpx.ts, gpx.ts
  r2.ts

messages/
  it.json / en.json / de.json

proxy.ts                    # i18n + protezione /manage/*
drizzle.config.ts
```

## Sviluppo locale

```bash
npm install
cp .env.local.example .env.local
# compila .env.local con le credenziali dell'ambiente di sviluppo — mai quelle di produzione
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000). Elenco completo delle variabili, dove
procurarsele e come ruotarle: [`docs/environment-variables.md`](docs/environment-variables.md).

## Test e build

```bash
npm run typecheck   # tipi
npm run lint         # eslint
npm test              # vitest, unit
npm run test:browser   # playwright, contro un preview
npm run build          # verifica i tipi e produce la build di produzione
```

`npm run build` e `npm run dev` girano sempre con `--webpack`, mai Turbopack — necessario per
Cesium.

## i18n

Il locale si ricava dall'URL (`app/[lang]/`), non da un header: `proxy.ts` rileva la lingua al
primo accesso e reindirizza a `/it`, `/en` o `/de`. Per aggiungere stringhe, modifica i tre
file in `messages/` mantenendo le stesse chiavi. Le traduzioni dei percorsi (nome,
descrizione) sono generate automaticamente da Azure Translator — l'admin scrive solo
l'italiano.

## Database

Schema gestito con Drizzle ORM, sempre attraverso il pooler in transaction mode. Dopo una
modifica allo schema:

```bash
npx drizzle-kit generate   # genera SQL in lib/db/migrations/
npx drizzle-kit migrate    # applica al database (richiede DATABASE_DIRECT_URL)
```

## Licenza

Codice proprietario — tutti i diritti riservati. I percorsi e i file GPX sono proprietà
esclusiva di Lelettrica di Leoni Gabriele.
