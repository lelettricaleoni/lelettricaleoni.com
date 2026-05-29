# Lelettrica — lelettricaleoni.com

Sito web per **Lelettrica di Leoni Gabriele**, noleggio e-bike Flyer e riparazioni bici a Dro (TN), sul Lago di Garda.

## Stack

| Tecnologia | Versione |
|---|---|
| Next.js App Router | 16.2.4 |
| React | 19 |
| TypeScript | — |
| Tailwind CSS | v4 |
| shadcn/ui | — |
| Drizzle ORM | — |
| Supabase (Auth + Postgres) | — |
| Cloudflare R2 | — |
| Azure Translator | — |

## Funzionalità

- **i18n nativo** — IT / EN / DE tramite `proxy.ts` + `app/[lang]/` + dizionari JSON
- **SEO avanzato** — JSON-LD `LocalBusiness` + `BikeShop`, hreflang, OG, sitemap, robots
- **GDPR compliant** — cookie consent via vanilla-cookieconsent v3; GA4 caricato solo dopo consenso
- **GA4 custom events** — `trackEvent` utility consent-aware
- **Mappa lazy** — Google Maps iframe caricato solo al click
- **Pagina percorsi** — lista e dettaglio percorsi e-bike consigliati con filtri, galleria, GPX
- **Pannello admin** — CRUD percorsi su URL nascosto, protetto da Supabase Auth

---

## Pagina percorsi (`/[lang]/percorsi`)

La pagina mostra i percorsi in e-bike consigliati ai clienti.

- **Lista** — griglia 2 colonne con filtri pill (difficoltà + tipo bici), client-side senza round-trip
- **Dettaglio** — statistiche km/dislivello/durata, galleria foto lightbox, link Strava/Komoot, download GPX watermarkato
- **ISR** — cache 3600s, invalidata automaticamente alla pubblicazione/modifica di un percorso
- **SEO** — `generateMetadata` per lingua + JSON-LD `ItemList` (lista) e `ExercisePlan` (dettaglio)
- **GPX watermark** — il file originale in R2 è intatto; il watermark con i dati di Lelettrica viene iniettato on-the-fly al download via `/api/percorsi/[slug]/gpx`

---

## Pannello admin (`/manage`)

URL oscuro, non indicizzato, non linkato pubblicamente.

### Accesso

Vai su `/manage` — se non sei autenticato vieni reindirizzato a `/manage/login`.

Inserisci le credenziali del tuo account Supabase (email + password). Per funzionare, l'account deve avere `user_metadata.role = 'admin'`. Per impostarlo:

1. Dashboard Supabase → Authentication → Users → seleziona l'utente
2. Modifica `raw_user_meta_data` aggiungendo `"role": "admin"`

### manage percorsi

Dalla sidebar clicca **Percorsi** per vedere la lista. Da lì puoi:

- **Nuovo percorso** — compila nome e descrizione in italiano, le traduzioni EN/DE vengono generate automaticamente da Azure Translator
- **Modifica** — aggiorna qualsiasi campo; spunta "Rigenera traduzioni" per ricalcolare EN/DE con Azure
- **Pubblica/Nascondi** — l'icona occhio toglie/ripristina la visibilità pubblica istantaneamente
- **Elimina** — rimuove il percorso, tutte le foto e il file GPX da R2

### Upload GPX

Trascina un file `.gpx` nel campo apposito. Il sistema estrae automaticamente km e dislivello dal file e compila i campi statistiche. Il file originale viene salvato su R2; al download pubblico riceve il watermark Lelettrica on-the-fly.

### Galleria foto

Carica più foto insieme. Trascina per riordinare — la prima foto diventa la copertina. Le immagini vengono salvate direttamente su Cloudflare R2 tramite presigned URL (nessun passaggio per il server Next.js).

---

## Struttura

```
app/
  layout.tsx
  [lang]/
    layout.tsx            # Metadata locale + JSON-LD LocalBusiness
    page.tsx              # Homepage
    privacy/page.tsx
    percorsi/
      page.tsx            # Lista percorsi pubblica (ISR)
      [slug]/page.tsx     # Dettaglio percorso (ISR)
  manage/               # Area admin (non indicizzata)
    login/page.tsx
    page.tsx              # Redirect → /manage/percorsi
    percorsi/
      page.tsx            # Lista percorsi admin
      nuovo/page.tsx      # Form nuovo percorso
      [id]/page.tsx       # Form modifica percorso
  api/
    percorsi/[slug]/gpx/route.ts  # Download GPX con watermark
  sitemap.ts / robots.ts

components/
  navbar.tsx              # + link Percorsi condizionale
  route-card.tsx          # Card percorso pubblica
  route-filters.tsx       # Filtri pill client-side
  route-gallery.tsx       # Galleria lightbox (yet-another-react-lightbox)
  route-share-button.tsx  # Copia link + GA4 event
  admin/
    admin-sidebar.tsx
    route-list-item.tsx
    route-form.tsx
    gpx-upload.tsx
    photo-upload.tsx

lib/
  db/
    schema.ts             # Tabelle Drizzle: routes, route_translations, route_photos
    index.ts              # Client Drizzle singleton
    migrations/           # SQL generato da drizzle-kit
  supabase/
    server.ts             # createSupabaseServerClient + getAdminUser
    client.ts             # createSupabaseBrowserClient
  actions/
    routes.ts             # Server Actions CRUD percorsi
    auth.ts               # loginAction + logoutAction
    translate.ts          # Azure Translator IT→EN/DE
  r2.ts                   # Client S3 R2 + presigned URL
  gpx.ts                  # parseGpxStats + watermarkGpx
  analytics.ts
  utils.ts

messages/
  it.json / en.json / de.json   # Include sezione "percorsi"

proxy.ts                  # i18n redirect + protezione /manage/*
drizzle.config.ts
types/gtag.d.ts
```

---

## Sviluppo locale

```bash
npm install
cp .env.local.example .env.local
# compila .env.local con le credenziali reali
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000).

## Test

```bash
npm test          # vitest — 4 test GPX (parseGpxStats + watermarkGpx)
npm run test:watch
```

## Build

```bash
npm run build
```

TypeScript viene verificato automaticamente durante la build.

---

## Variabili d'ambiente

Copia `.env.local.example` in `.env.local` e compila:

| Variabile | Descrizione |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chiave anon (legacy JWT) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chiave service role — Dashboard → Project Settings → API |
| `DATABASE_URL` | Pooler Supabase porta 6543 (runtime) |
| `DATABASE_DIRECT_URL` | Connessione diretta porta 5432 (migrazioni) |
| `R2_ACCOUNT_ID` | ID account Cloudflare |
| `R2_ACCESS_KEY_ID` | Access key R2 |
| `R2_SECRET_ACCESS_KEY` | Secret key R2 |
| `R2_BUCKET_NAME` | Nome bucket (default: `lelettrica-media`) |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | URL pubblico bucket R2 |
| `AZURE_TRANSLATOR_KEY` | Chiave Azure Cognitive Services |
| `AZURE_TRANSLATOR_REGION` | Regione Azure (es. `westeurope`) |
| `AZURE_TRANSLATOR_ENDPOINT` | `https://api.cognitive.microsofttranslator.com` |
| `NEXT_PUBLIC_SITE_URL` | URL produzione (es. `https://www.lelettricaleoni.com`) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | ID Google Analytics 4 |
| `NEXT_PUBLIC_MAPS_EMBED_URL` | URL embed Google Maps |

---

## i18n

Il rilevamento della lingua avviene in `proxy.ts` tramite l'header `Accept-Language`. L'utente viene reindirizzato automaticamente a `/it`, `/en` o `/de`.

Per aggiungere stringhe: modifica i tre file in `messages/` mantenendo le stesse chiavi in tutti e tre.

Le traduzioni dei percorsi (nome, descrizione) vengono gestite automaticamente da Azure Translator — l'admin inserisce solo l'italiano.

---

## Database

Schema gestito con Drizzle ORM. Per generare una nuova migrazione dopo modifiche allo schema:

```bash
npx drizzle-kit generate   # genera SQL in lib/db/migrations/
npx drizzle-kit migrate    # applica al DB (richiede DATABASE_DIRECT_URL)
```

---

## GA4 Events

Tutti condizionati al consenso cookie analytics.

| Evento | Parametri | Trigger |
|---|---|---|
| `phone_call` | `{ source }` | Click telefono |
| `email_click` | `{ source }` | Click email |
| `cta_click` | `{ cta_name }` | CTA hero |
| `get_directions` | — | Click indicazioni |
| `map_load` | — | Caricamento mappa |
| `file_download` | `{ file_name, file_extension }` | Download PDF |
| `outbound_click` | `{ link_domain }` | Click Instagram |
| `language_switch` | `{ language }` | Cambio lingua |
| `section_view` | `{ section_name }` | Scroll sezione |
| `view_route` | `{ slug }` | Apertura dettaglio percorso |
| `filter_routes` | `{ filter_type, filter_value }` | Cambio filtro lista |
| `share_route` | `{ method, url }` | Click condividi |
| `download_gpx` | `{ route }` | Download GPX |
| `open_strava` | `{ route }` | Click link Strava |
| `open_komoot` | `{ route }` | Click link Komoot |

---

## Licenza

Codice proprietario — tutti i diritti riservati. I percorsi e i file GPX sono proprietà esclusiva di Lelettrica di Leoni Gabriele.
