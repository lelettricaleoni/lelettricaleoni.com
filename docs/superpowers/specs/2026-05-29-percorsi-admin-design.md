# Design Spec — Pagina Percorsi + Pannello Admin

**Data**: 2026-05-29  
**Branch**: `feature/percorsi-admin`  
**Stato**: approvato, pronto per implementazione

---

## Obiettivo

Aggiungere al sito Lelettrica:
1. Una **pagina pubblica** che mostra i percorsi in e-bike consigliati, con dettaglio per ogni giro
2. Un **pannello admin nascosto** per gestire i percorsi (CRUD, foto, GPX, traduzione automatica)
3. **Autenticazione admin** con Supabase Auth, URL oscuro, controllo ruoli

Email (React Email + Resend) e sistema di prenotazioni sono esplicitamente fuori scope per ora.

---

## Stack aggiunto

| Libreria | Uso |
|---|---|
| `drizzle-orm` + `drizzle-kit` | ORM, schema as code, migrations |
| `@supabase/ssr` | Auth SSR, gestione sessione cookie |
| `@aws-sdk/client-s3` | Client Cloudflare R2 (S3-compat) |
| `@aws-sdk/s3-request-presigner` | Presigned URL per upload foto/GPX |
| `fast-xml-parser` | Parsing e watermarking GPX |
| `@tmcw/togeojson` | Estrazione statistiche da GPX (km, dislivello) |
| `react-dropzone` | UI drag&drop upload foto galleria |
| `yet-another-react-lightbox` | Lightbox galleria pubblica |

---

## Struttura file

```
app/
├── [lang]/
│   └── percorsi/
│       ├── page.tsx              ← lista pubblica (ISR 3600s)
│       └── [slug]/
│           └── page.tsx          ← dettaglio pubblico (ISR 3600s)
├── gestione/                     ← fuori routing i18n, non indicizzata
│   ├── login/page.tsx
│   ├── page.tsx                  ← redirect → /gestione/percorsi
│   └── percorsi/
│       ├── page.tsx              ← lista percorsi admin
│       ├── nuovo/page.tsx        ← form nuovo percorso
│       └── [id]/page.tsx         ← form modifica percorso
├── api/
│   └── percorsi/
│       └── [slug]/
│           └── gpx/route.ts      ← download GPX con watermark Lelettrica
└── robots.ts                     ← aggiornato: /gestione/* disallow

lib/
├── db/
│   ├── index.ts                  ← client Drizzle (Supabase Postgres)
│   └── schema.ts                 ← tabelle routes, route_translations, route_photos
├── actions/
│   ├── routes.ts                 ← Server Actions: create, update, delete, publish
│   └── translate.ts              ← Azure Translator IT→EN/DE
├── r2.ts                         ← client S3 R2 + presigned URL generator
├── gpx.ts                        ← parser GPX + watermark metadata
└── supabase/
    ├── server.ts                 ← createServerClient (@supabase/ssr)
    └── client.ts                 ← createBrowserClient

proxy.ts                          ← aggiornato: /gestione/* → /gestione/login se non auth
```

---

## Database (Drizzle + Supabase Postgres)

### `routes`
```ts
id, slug (unique), difficulty (easy|medium|hard|expert),
distance_km (numeric), elevation_m (integer), duration_min (integer),
surface (asphalt|dirt|mixed), bike_types (text[]),
strava_url, komoot_url, gpx_key (path R2),
is_published (bool, default false),
created_at, updated_at
```

### `route_translations`
```ts
id, route_id (fk→routes), locale (it|en|de),
name, description, start_point_label,
is_auto_translated (bool)
```
Una riga per ogni combinazione route+locale (max 3 per percorso).

### `route_photos`
```ts
id, route_id (fk→routes), storage_key (path R2),
display_order (integer), alt_text,
created_at
```
La foto con `display_order = 0` è la copertina.

### Auth
Supabase Auth nativo. Nessuna tabella extra. Ruolo admin via:
```ts
supabase.auth.admin.updateUserById(uid, {
  user_metadata: { role: 'admin' }
})
```

### RLS (Row Level Security)
- `routes`, `route_translations`, `route_photos`: SELECT pubblico, INSERT/UPDATE/DELETE solo `user_metadata.role = 'admin'`

---

## Storage — Cloudflare R2

**Bucket**: `lelettrica-media` (pubblico in lettura)

```
route-covers/{route-id}/cover.{ext}
route-photos/{route-id}/{uuid}.{ext}
route-gpx/{route-id}/track.gpx
```

- Upload: presigned URL generato da una **Server Action** (`generatePresignedUploadUrl`), upload diretto browser → R2 (zero passaggio per il server Next.js)
- Lettura immagini: URL pubblico R2 + Next.js `<Image>` (WebP, cache CDN Vercel immutable)
- Download GPX: **non diretto** — passa per `/api/percorsi/[slug]/gpx` che inietta watermark

---

## GPX Watermarking

Prima di servire il file GPX, il route handler inietta il blocco `<metadata>`:

```xml
<metadata>
  <name>Percorso Lelettrica — {nome percorso}</name>
  <author><name>Lelettrica di Leoni Gabriele</name></author>
  <copyright author="Lelettrica di Leoni Gabriele">
    <year>{anno}</year>
    <license>Tutti i diritti riservati — www.lelettricaleoni.com</license>
  </copyright>
  <desc>File GPX di proprietà di Lelettrica. Vietata la riproduzione senza autorizzazione.</desc>
</metadata>
```

Il file originale in R2 rimane non modificato. Il watermark è generato on-the-fly ad ogni download.

---

## Multilingua percorsi

- L'admin inserisce nome e descrizione **solo in italiano**
- Al salvataggio, una Server Action chiama **Azure Translator** (endpoint `api.cognitive.microsofttranslator.com`)
- EN e DE vengono salvati in `route_translations` con `is_auto_translated: true`
- L'admin può sovrascrivere manualmente le traduzioni (il flag diventa `false`)
- Campi tecnici (km, dislivello, ecc.) e tipi bici sono invarianti per lingua

---

## Autenticazione admin

- URL: `/gestione` — non indicizzato (`robots.ts`), non linkato da nessuna parte nel sito
- `proxy.ts` aggiornato: qualsiasi richiesta a `/gestione/*` che non ha sessione Supabase valida → redirect `302` a `/gestione/login`
- Login: email + password (Supabase Auth)
- Logout: Server Action che chiama `supabase.auth.signOut()` + redirect a `/gestione/login`
- Futuro: aggiunta utenti dal dashboard Supabase, permessi granulari via `role`

---

## Pagina pubblica — lista `/[lang]/percorsi`

- **Rendering**: SSR con ISR `revalidate: 3600`, invalidato on-demand da `revalidatePath` al publish/update
- **Layout**: griglia 2 colonne (mobile: 1 colonna), filtri pill sopra (tipo bici + difficoltà), filtro client-side
- **Skeleton**: `<Suspense>` + skeleton card per streaming SSR e transizioni filtro
- **SEO**: `generateMetadata` per titolo/descrizione per lingua + JSON-LD `ItemList`
- **Copyright**: nota in fondo "I percorsi sono proprietà esclusiva di Lelettrica. Tutti i diritti riservati."

---

## Pagina pubblica — dettaglio `/[lang]/percorsi/[slug]`

- **Rendering**: ISR `revalidate: 3600` + `generateStaticParams` per pre-render
- **Contenuto**: 
  - Hero con foto copertina
  - Statistiche: km, dislivello, durata, difficoltà, fondo, tipo bici
  - Descrizione completa (dalla traduzione locale)
  - Galleria foto (lightbox `yet-another-react-lightbox`)
  - Punto di partenza
  - Bottoni: Strava, Komoot, Download GPX (watermarked)
  - Pulsante share (copy link + GA4 event `share_route`)
- **SEO**: OG image dinamica usando foto copertina del percorso, JSON-LD `ExerciseRoute`
- **Future feature (TODO)**: flyover 3D GPX track con Mapbox/Cesium

---

## Analytics (GA4 — Consent Mode v2 già attivo)

Nuovi eventi custom da aggiungere:

| Evento | Trigger |
|---|---|
| `view_route` | Apertura pagina dettaglio |
| `share_route` | Click pulsante share (param: `method`) |
| `download_gpx` | Click download GPX |
| `open_strava` | Click link Strava |
| `open_komoot` | Click link Komoot |
| `filter_routes` | Cambio filtro sulla lista (param: `filter_type`, `filter_value`) |

Tutti rispettano il consenso esistente — nessun dato inviato se `analytics_storage: denied`.

---

## Pannello admin — layout

- Sidebar fissa sinistra (dark `#1e3a5f`)
- Voci sidebar: Percorsi, Profilo, Impostazioni, Esci
- Form percorso: nome IT, descrizione IT, difficoltà, stats (km/dislivello auto da GPX oppure manuali), durata, fondo, tipo bici (multi-select), upload GPX, link Strava/Komoot, galleria foto (drag&drop riordino), stato (bozza/pubblicato)
- Traduzione automatica: chiamata Azure al salvataggio, badge "tradotto automaticamente" visibile

---

## SEO e performance — priorità

- `generateMetadata` per ogni pagina percorsi (titolo, description, OG per lingua)
- `generateStaticParams` per pre-render di tutti i slug
- JSON-LD: `ItemList` sulla lista, `ExerciseRoute` sul dettaglio
- Sitemap (`app/sitemap.ts`) aggiornata con percorsi pubblicati
- Next.js `<Image>` per tutte le foto (WebP automatico, lazy load, cache immutable)
- Skeleton loading via `<Suspense>` boundaries
- Filtri client-side (zero round-trip aggiuntivi)
- ISR + `revalidatePath` per aggiornamenti istantanei senza rebuild

---

## Privacy e IP

- Privacy policy aggiornata: menzione dei percorsi come contenuto proprietario
- Nota copyright sulla pagina percorsi pubblica (IT/EN/DE)
- GPX watermarkato con metadata Lelettrica
- R2 bucket: lettura pubblica ma nessun listing directory (CORS configurato solo per il dominio Lelettrica)

---

## Git workflow

- Branch: `feature/percorsi-admin`
- Commit atomici per area (DB schema, pagina pubblica, admin auth, ecc.)
- PR su `main` solo quando tutto è testato
- `.superpowers/` aggiunto a `.gitignore`

---

## Fuori scope (da implementare in futuro)

- Import percorsi da Strava API
- Flyover 3D GPX track (Mapbox GL / Cesium)
- Sistema prenotazioni noleggio
- Registrazione pubblica utenti
- Email transazionali (React Email + Resend)

