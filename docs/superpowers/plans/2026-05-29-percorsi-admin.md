# Percorsi + Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere pagina pubblica percorsi (lista + dettaglio), pannello admin nascosto con CRUD, Supabase Auth, Cloudflare R2 per media, Azure Translator per i18n automatica, GPX watermarking.

**Architecture:** Next.js 16 App Router con Server Actions per tutto il CRUD. DB Drizzle + Supabase Postgres. Storage Cloudflare R2 con URL pubblici + Next.js Image optimization. Proxy.ts aggiornato per proteggere `/gestione/*`. ISR con revalidatePath per aggiornamenti istantanei.

**Tech Stack:** drizzle-orm + postgres, @supabase/ssr, @aws-sdk/client-s3, fast-xml-parser, react-dropzone, yet-another-react-lightbox, @dnd-kit/sortable, zod, vitest

**Branch:** `feature/percorsi-admin`

---

## Task 1: Installa dipendenze + template variabili d'ambiente

**Files:**
- Modify: `package.json`
- Create: `.env.local.example`

- [ ] **Step 1: Installa dipendenze runtime**

```bash
npm install drizzle-orm postgres @supabase/ssr @supabase/supabase-js @aws-sdk/client-s3 @aws-sdk/s3-request-presigner fast-xml-parser react-dropzone yet-another-react-lightbox zod @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 2: Installa dipendenze dev**

```bash
npm install -D drizzle-kit vitest @types/pg
```

- [ ] **Step 3: Aggiungi script vitest a package.json**

In `package.json`, aggiungi nella sezione `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Aggiungi shadcn components**

```bash
npx shadcn@latest add label select textarea dialog sonner tabs skeleton dropdown-menu alert-dialog switch checkbox
```

- [ ] **Step 5: Crea template env**

Crea `.env.local.example`:
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://[project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]

# Drizzle / Postgres
DATABASE_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_DIRECT_URL=postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

# Cloudflare R2
R2_ACCOUNT_ID=[cloudflare-account-id]
R2_ACCESS_KEY_ID=[r2-access-key]
R2_SECRET_ACCESS_KEY=[r2-secret-key]
R2_BUCKET_NAME=lelettrica-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://pub-[hash].r2.dev

# Azure Translator
AZURE_TRANSLATOR_KEY=[key]
AZURE_TRANSLATOR_REGION=westeurope
AZURE_TRANSLATOR_ENDPOINT=https://api.cognitive.microsofttranslator.com
```

- [ ] **Step 6: Verifica build non rotta**

```bash
npm run build
```
Atteso: build verde senza errori (nessun nuovo file ancora).

---

## Task 2: Drizzle schema + configurazione

**Files:**
- Create: `lib/db/schema.ts`
- Create: `lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Crea `drizzle.config.ts`**

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_DIRECT_URL!,
  },
})
```

- [ ] **Step 2: Crea `lib/db/schema.ts`**

```ts
import {
  pgTable, text, integer, numeric, boolean,
  timestamp, uuid, pgEnum, index
} from 'drizzle-orm/pg-core'

export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard', 'expert'])
export const surfaceEnum = pgEnum('surface', ['asphalt', 'dirt', 'mixed'])
export const localeEnum = pgEnum('locale', ['it', 'en', 'de'])

export const routes = pgTable('routes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  slug:        text('slug').notNull().unique(),
  difficulty:  difficultyEnum('difficulty').notNull(),
  distanceKm:  numeric('distance_km', { precision: 6, scale: 2 }),
  elevationM:  integer('elevation_m'),
  durationMin: integer('duration_min'),
  surface:     surfaceEnum('surface').notNull().default('mixed'),
  bikeTypes:   text('bike_types').array().notNull().default([]),
  stravaUrl:   text('strava_url'),
  komootUrl:   text('komoot_url'),
  gpxKey:      text('gpx_key'),
  isPublished: boolean('is_published').notNull().default(false),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('routes_slug_idx').on(t.slug), index('routes_published_idx').on(t.isPublished)])

export const routeTranslations = pgTable('route_translations', {
  id:                uuid('id').primaryKey().defaultRandom(),
  routeId:           uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  locale:            localeEnum('locale').notNull(),
  name:              text('name').notNull(),
  description:       text('description').notNull(),
  startPointLabel:   text('start_point_label'),
  isAutoTranslated:  boolean('is_auto_translated').notNull().default(false),
}, (t) => [index('route_translations_route_locale_idx').on(t.routeId, t.locale)])

export const routePhotos = pgTable('route_photos', {
  id:           uuid('id').primaryKey().defaultRandom(),
  routeId:      uuid('route_id').notNull().references(() => routes.id, { onDelete: 'cascade' }),
  storageKey:   text('storage_key').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
  altText:      text('alt_text'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('route_photos_route_idx').on(t.routeId)])

export type Route = typeof routes.$inferSelect
export type RouteTranslation = typeof routeTranslations.$inferSelect
export type RoutePhoto = typeof routePhotos.$inferSelect
export type NewRoute = typeof routes.$inferInsert
export type NewRouteTranslation = typeof routeTranslations.$inferInsert
export type NewRoutePhoto = typeof routePhotos.$inferInsert
```

- [ ] **Step 3: Crea `lib/db/index.ts`**

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { db: ReturnType<typeof drizzle> }

function createDb() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 })
  return drizzle(client, { schema })
}

export const db = globalForDb.db ?? createDb()
if (process.env.NODE_ENV !== 'production') globalForDb.db = db

export * from './schema'
```

- [ ] **Step 4: Verifica TypeScript**

```bash
npx tsc --noEmit
```
Atteso: nessun errore di tipo.

---

## Task 3: Migrazione database

**Prerequisito:** `.env.local` compilato con `DATABASE_DIRECT_URL` reale.

- [ ] **Step 1: Genera migrazione**

```bash
npx drizzle-kit generate
```
Atteso: file `lib/db/migrations/0000_initial.sql` creato con `CREATE TABLE routes`, `CREATE TABLE route_translations`, `CREATE TABLE route_photos` + enum.

- [ ] **Step 2: Applica migrazione al DB Supabase**

```bash
npx drizzle-kit migrate
```
Atteso: `[✓] migrations applied` senza errori.

- [ ] **Step 3: Abilita RLS su Supabase dashboard**

Nel dashboard Supabase → Table Editor → per ciascuna tabella (`routes`, `route_translations`, `route_photos`):
1. Abilita Row Level Security
2. Aggiungi policy: nome `public_read`, comando `SELECT`, using `(is_published = true)` per `routes`; `(true)` per `route_translations` e `route_photos`
3. Aggiungi policy admin write: nome `admin_write`, comandi `INSERT, UPDATE, DELETE`, using `(auth.jwt() ->> 'role' = 'admin')` per tutte e 3

- [ ] **Step 4: Commit**

```bash
git add lib/db/ drizzle.config.ts .env.local.example
git commit -m "feat: add Drizzle schema and migrations for routes/translations/photos"
```

---

## Task 4: Supabase SSR clients

**Files:**
- Create: `lib/supabase/server.ts`
- Create: `lib/supabase/client.ts`

- [ ] **Step 1: Crea `lib/supabase/server.ts`**

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function getAdminUser() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  if (user.user_metadata?.role !== 'admin') return null
  return user
}
```

- [ ] **Step 2: Crea `lib/supabase/client.ts`**

```ts
'use client'
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Verifica TypeScript**

```bash
npx tsc --noEmit
```

---

## Task 5: Cloudflare R2 client

**Files:**
- Create: `lib/r2.ts`

- [ ] **Step 1: Crea `lib/r2.ts`**

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const R2_ENDPOINT = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
})

export const R2_BUCKET = process.env.R2_BUCKET_NAME!
export const R2_PUBLIC_URL = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? '').replace(/\/$/, '')

export function r2PublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export async function getPresignedUploadUrl(key: string, contentType: string): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(s3, command, { expiresIn: 300 })
}

export async function deleteR2Object(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }))
}
```

---

## Task 6: Azure Translator

**Files:**
- Create: `lib/actions/translate.ts`

- [ ] **Step 1: Crea `lib/actions/translate.ts`**

```ts
'use server'

interface TranslationResult {
  en: string
  de: string
}

export async function translateFromItalian(text: string): Promise<TranslationResult> {
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT!
  const key = process.env.AZURE_TRANSLATOR_KEY!
  const region = process.env.AZURE_TRANSLATOR_REGION!

  const response = await fetch(
    `${endpoint}/translate?api-version=3.0&from=it&to=en&to=de`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ text }]),
    }
  )

  if (!response.ok) {
    throw new Error(`Azure Translator error: ${response.status}`)
  }

  const data = await response.json()
  const translations: { to: string; text: string }[] = data[0]?.translations ?? []
  const en = translations.find((t) => t.to === 'en')?.text ?? text
  const de = translations.find((t) => t.to === 'de')?.text ?? text
  return { en, de }
}
```

---

## Task 7: GPX utilities (parse stats + watermark)

**Files:**
- Create: `lib/gpx.ts`
- Create: `lib/gpx.test.ts`

- [ ] **Step 1: Scrivi il test (fallirà)**

```ts
// lib/gpx.test.ts
import { describe, it, expect } from 'vitest'
import { parseGpxStats, watermarkGpx } from './gpx'

const SAMPLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test">
  <trk><trkseg>
    <trkpt lat="45.9589" lon="10.9042"><ele>65</ele></trkpt>
    <trkpt lat="45.9600" lon="10.9050"><ele>70</ele></trkpt>
    <trkpt lat="45.9650" lon="10.9100"><ele>60</ele></trkpt>
    <trkpt lat="45.9700" lon="10.9150"><ele>80</ele></trkpt>
  </trkseg></trk>
</gpx>`

describe('parseGpxStats', () => {
  it('returns distance and elevation gain', () => {
    const stats = parseGpxStats(SAMPLE_GPX)
    expect(stats.distanceKm).toBeGreaterThan(0)
    expect(stats.elevationM).toBeGreaterThan(0)
  })

  it('elevation gain ignores descents', () => {
    const stats = parseGpxStats(SAMPLE_GPX)
    // gains: +5 (65→70), +20 (60→80) = 25m, ignoring -10 (70→60)
    expect(stats.elevationM).toBe(25)
  })
})

describe('watermarkGpx', () => {
  it('injects Lelettrica metadata into GPX', () => {
    const result = watermarkGpx(SAMPLE_GPX, 'Lago di Garda nord')
    expect(result).toContain('Lelettrica')
    expect(result).toContain('Lago di Garda nord')
    expect(result).toContain('<metadata>')
  })

  it('preserves original trackpoints', () => {
    const result = watermarkGpx(SAMPLE_GPX, 'Test')
    expect(result).toContain('lat="45.9589"')
  })
})
```

- [ ] **Step 2: Esegui test per verificare che falliscano**

```bash
npm test
```
Atteso: 4 test falliti con `Cannot find module './gpx'`.

- [ ] **Step 3: Implementa `lib/gpx.ts`**

```ts
import { XMLParser, XMLBuilder } from 'fast-xml-parser'

interface GpxStats {
  distanceKm: number
  elevationM: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function parseGpxStats(gpxString: string): GpxStats {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const obj = parser.parse(gpxString)

  const trkseg = obj?.gpx?.trk?.trkseg
  const rawPoints = trkseg?.trkpt ?? []
  const points: { lat: number; lon: number; ele: number }[] = (
    Array.isArray(rawPoints) ? rawPoints : [rawPoints]
  ).map((p: Record<string, unknown>) => ({
    lat: parseFloat(String(p['@_lat'] ?? 0)),
    lon: parseFloat(String(p['@_lon'] ?? 0)),
    ele: parseFloat(String(p['ele'] ?? 0)),
  }))

  let distanceKm = 0
  let elevationM = 0

  for (let i = 1; i < points.length; i++) {
    distanceKm += haversineKm(
      points[i - 1].lat, points[i - 1].lon,
      points[i].lat, points[i].lon
    )
    const diff = points[i].ele - points[i - 1].ele
    if (diff > 0) elevationM += diff
  }

  return {
    distanceKm: Math.round(distanceKm * 10) / 10,
    elevationM: Math.round(elevationM),
  }
}

export function watermarkGpx(gpxString: string, routeName: string): string {
  const year = new Date().getFullYear()
  const metadata = `
  <metadata>
    <name>Percorso Lelettrica — ${routeName}</name>
    <author><name>Lelettrica di Leoni Gabriele</name></author>
    <copyright author="Lelettrica di Leoni Gabriele">
      <year>${year}</year>
      <license>Tutti i diritti riservati — www.lelettricaleoni.com</license>
    </copyright>
    <desc>File GPX di proprietà di Lelettrica. Vietata la riproduzione senza autorizzazione. www.lelettricaleoni.com</desc>
  </metadata>`

  if (gpxString.includes('<metadata>')) {
    return gpxString.replace(/<metadata>[\s\S]*?<\/metadata>/, metadata)
  }
  return gpxString.replace(/(<gpx[^>]*>)/, `$1\n${metadata}`)
}
```

- [ ] **Step 4: Esegui test per verificare che passino**

```bash
npm test
```
Atteso: 4 test passati (PASS).

- [ ] **Step 5: Commit**

```bash
git add lib/ drizzle.config.ts .env.local.example package.json
git commit -m "feat: add Drizzle schema, Supabase/R2/Azure clients, GPX utilities"
```

---

## Task 8: Aggiorna proxy.ts (protezione /gestione/*)

**Files:**
- Modify: `proxy.ts`

- [ ] **Step 1: Aggiorna `proxy.ts`**

Sostituisci completamente il contenuto di `proxy.ts`:

```ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import Negotiator from 'negotiator'
import { match } from '@formatjs/intl-localematcher'
import { createServerClient } from '@supabase/ssr'

const locales = ['it', 'en', 'de']
const defaultLocale = 'it'

function getLocale(request: NextRequest): string {
  const acceptLanguage = request.headers.get('accept-language') ?? ''
  const headers = { 'accept-language': acceptLanguage }
  const languages = new Negotiator({ headers }).languages()
  try {
    return match(languages, locales, defaultLocale)
  } catch {
    return defaultLocale
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protezione area admin
  if (pathname.startsWith('/gestione')) {
    if (pathname === '/gestione/login') {
      return NextResponse.next()
    }

    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user || user.user_metadata?.role !== 'admin') {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/gestione/login'
      return NextResponse.redirect(loginUrl)
    }

    return supabaseResponse
  }

  // i18n routing esistente
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  )

  if (pathnameHasLocale) {
    const locale = pathname.split('/')[1]
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-locale', locale)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const locale = getLocale(request)
  request.nextUrl.pathname = `/${locale}${pathname}`
  return NextResponse.redirect(request.nextUrl, 301)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|opengraph-image|sitemap\\.xml|robots\\.txt|.*\\.pdf$|svg/.*|images/.*).*)',
  ],
}
```

- [ ] **Step 2: Aggiorna `app/robots.ts`**

```ts
import type { MetadataRoute } from 'next'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/gestione/', '/gestione/login'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
```

- [ ] **Step 3: Build**

```bash
npm run build
```
Atteso: build verde.

---

## Task 9: Admin login page + logout action

**Files:**
- Create: `app/gestione/login/page.tsx`
- Create: `app/gestione/layout.tsx`
- Create: `lib/actions/auth.ts`

- [ ] **Step 1: Crea `lib/actions/auth.ts`**

```ts
'use server'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Credenziali non valide. Riprova.' }
  }

  redirect('/gestione/percorsi')
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/gestione/login')
}
```

- [ ] **Step 2: Crea `app/gestione/login/page.tsx`**

```tsx
import { loginAction } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-lg shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold text-[#1e3a5f]">Lelettrica — Gestione</h1>
          <p className="text-sm text-muted-foreground mt-1">Accesso riservato</p>
        </div>

        <form action={loginAction} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <Button type="submit" className="w-full bg-[#1e3a5f] hover:bg-[#152c4a]">
            Accedi
          </Button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Crea `app/gestione/layout.tsx` (radice admin — nessun layout visivo, solo struttura)**

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Gestione — Lelettrica',
  robots: { index: false, follow: false },
}

export default function GestioneRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

- [ ] **Step 4: Build e test manuale**

```bash
npm run build && npm run dev
```
Naviga a `http://localhost:3000/gestione` → deve redirigere a `/gestione/login`.
Naviga a `http://localhost:3000/gestione/login` → deve mostrare il form.

---

## Task 10: Admin layout con sidebar + pagina percorsi (struttura)

**Files:**
- Create: `app/gestione/percorsi/layout.tsx`
- Create: `components/admin/admin-sidebar.tsx`
- Create: `app/gestione/percorsi/page.tsx` (stub)
- Create: `app/gestione/page.tsx` (redirect)

- [ ] **Step 1: Crea `components/admin/admin-sidebar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Map, LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/gestione/percorsi', label: 'Percorsi', icon: Map },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-[#1e3a5f] flex flex-col py-6 px-3 shrink-0">
      <div className="text-white font-bold text-sm px-3 mb-8">⚡ Gestione</div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-white/15 text-white font-medium'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            )}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>

      <form action={logoutAction}>
        <button
          type="submit"
          className="flex items-center gap-2 px-3 py-2 text-white/50 hover:text-white text-sm w-full rounded-md hover:bg-white/10 transition-colors"
        >
          <LogOut size={15} />
          Esci
        </button>
      </form>
    </aside>
  )
}
```

- [ ] **Step 2: Crea `app/gestione/percorsi/layout.tsx`**

```tsx
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { Toaster } from '@/components/ui/sonner'

export default function AdminPercorsiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 p-8 overflow-auto">
        {children}
      </main>
      <Toaster richColors />
    </div>
  )
}
```

- [ ] **Step 3: Crea `app/gestione/page.tsx`**

```tsx
import { redirect } from 'next/navigation'
export default function GestionePage() {
  redirect('/gestione/percorsi')
}
```

- [ ] **Step 4: Crea `app/gestione/percorsi/page.tsx` (stub)**

```tsx
export default function AdminPercorsiPage() {
  return <div className="text-2xl font-bold text-[#1e3a5f]">Percorsi — in costruzione</div>
}
```

- [ ] **Step 5: Build + test visivo**

```bash
npm run build && npm run dev
```
Login con account admin → deve mostrare sidebar + stub page.

---

## Task 11: Server Actions CRUD percorsi

**Files:**
- Create: `lib/actions/routes.ts`

- [ ] **Step 1: Crea `lib/actions/routes.ts`**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { getAdminUser } from '@/lib/supabase/server'
import { translateFromItalian } from './translate'
import { deleteR2Object, getPresignedUploadUrl } from '@/lib/r2'

// ── Schema validazione ──────────────────────────────────────────────────────

const RouteSchema = z.object({
  nameIt:          z.string().min(2).max(200),
  descriptionIt:   z.string().min(10),
  startPointLabel: z.string().optional(),
  difficulty:      z.enum(['easy', 'medium', 'hard', 'expert']),
  distanceKm:      z.coerce.number().positive().optional(),
  elevationM:      z.coerce.number().nonnegative().int().optional(),
  durationMin:     z.coerce.number().positive().int().optional(),
  surface:         z.enum(['asphalt', 'dirt', 'mixed']),
  bikeTypes:       z.array(z.string()).min(1),
  stravaUrl:       z.string().url().optional().or(z.literal('')),
  komootUrl:       z.string().url().optional().or(z.literal('')),
  gpxKey:          z.string().optional(),
})

export type RouteFormState = {
  errors?: Partial<Record<keyof z.infer<typeof RouteSchema>, string[]>>
  message?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function requireAdmin() {
  const user = await getAdminUser()
  if (!user) throw new Error('Unauthorized')
}

// ── GET (usato nei Server Components) ───────────────────────────────────────

export async function getRoutesForAdmin() {
  await requireAdmin()
  return db
    .select()
    .from(routes)
    .orderBy(desc(routes.createdAt))
}

export async function getRouteWithDetails(id: string) {
  await requireAdmin()
  const [route] = await db.select().from(routes).where(eq(routes.id, id))
  if (!route) return null

  const translations = await db
    .select()
    .from(routeTranslations)
    .where(eq(routeTranslations.routeId, id))

  const photos = await db
    .select()
    .from(routePhotos)
    .where(eq(routePhotos.routeId, id))
    .orderBy(routePhotos.displayOrder)

  return { route, translations, photos }
}

// ── CREATE ───────────────────────────────────────────────────────────────────

export async function createRouteAction(
  _prev: RouteFormState,
  formData: FormData
): Promise<RouteFormState> {
  await requireAdmin()

  const bikeTypes = formData.getAll('bikeTypes') as string[]
  const raw = {
    nameIt:          formData.get('nameIt'),
    descriptionIt:   formData.get('descriptionIt'),
    startPointLabel: formData.get('startPointLabel') || undefined,
    difficulty:      formData.get('difficulty'),
    distanceKm:      formData.get('distanceKm') || undefined,
    elevationM:      formData.get('elevationM') || undefined,
    durationMin:     formData.get('durationMin') || undefined,
    surface:         formData.get('surface'),
    bikeTypes,
    stravaUrl:       formData.get('stravaUrl') || undefined,
    komootUrl:       formData.get('komootUrl') || undefined,
    gpxKey:          formData.get('gpxKey') || undefined,
  }

  const parsed = RouteSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { nameIt, descriptionIt, startPointLabel, ...routeData } = parsed.data

  const slug = slugify(nameIt)
  const [newRoute] = await db.insert(routes).values({
    slug,
    difficulty: routeData.difficulty,
    distanceKm: routeData.distanceKm?.toString(),
    elevationM: routeData.elevationM,
    durationMin: routeData.durationMin,
    surface: routeData.surface,
    bikeTypes: routeData.bikeTypes,
    stravaUrl: routeData.stravaUrl || null,
    komootUrl: routeData.komootUrl || null,
    gpxKey: routeData.gpxKey || null,
  }).returning()

  // Traduzione automatica EN/DE
  const [nameTranslations, descTranslations] = await Promise.all([
    translateFromItalian(nameIt),
    translateFromItalian(descriptionIt),
  ])

  await db.insert(routeTranslations).values([
    { routeId: newRoute.id, locale: 'it', name: nameIt, description: descriptionIt, startPointLabel, isAutoTranslated: false },
    { routeId: newRoute.id, locale: 'en', name: nameTranslations.en, description: descTranslations.en, startPointLabel, isAutoTranslated: true },
    { routeId: newRoute.id, locale: 'de', name: nameTranslations.de, description: descTranslations.de, startPointLabel, isAutoTranslated: true },
  ])

  revalidatePath('/[lang]/percorsi', 'page')
  redirect('/gestione/percorsi')
}

// ── UPDATE ───────────────────────────────────────────────────────────────────

export async function updateRouteAction(
  id: string,
  _prev: RouteFormState,
  formData: FormData
): Promise<RouteFormState> {
  await requireAdmin()

  const bikeTypes = formData.getAll('bikeTypes') as string[]
  const raw = {
    nameIt:          formData.get('nameIt'),
    descriptionIt:   formData.get('descriptionIt'),
    startPointLabel: formData.get('startPointLabel') || undefined,
    difficulty:      formData.get('difficulty'),
    distanceKm:      formData.get('distanceKm') || undefined,
    elevationM:      formData.get('elevationM') || undefined,
    durationMin:     formData.get('durationMin') || undefined,
    surface:         formData.get('surface'),
    bikeTypes,
    stravaUrl:       formData.get('stravaUrl') || undefined,
    komootUrl:       formData.get('komootUrl') || undefined,
    gpxKey:          formData.get('gpxKey') || undefined,
  }

  const parsed = RouteSchema.safeParse(raw)
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { nameIt, descriptionIt, startPointLabel, ...routeData } = parsed.data
  const slug = slugify(nameIt)

  await db.update(routes).set({
    slug,
    difficulty: routeData.difficulty,
    distanceKm: routeData.distanceKm?.toString(),
    elevationM: routeData.elevationM,
    durationMin: routeData.durationMin,
    surface: routeData.surface,
    bikeTypes: routeData.bikeTypes,
    stravaUrl: routeData.stravaUrl || null,
    komootUrl: routeData.komootUrl || null,
    gpxKey: routeData.gpxKey || null,
    updatedAt: new Date(),
  }).where(eq(routes.id, id))

  const reTranslate = formData.get('retranslate') === 'true'
  if (reTranslate) {
    const [nameT, descT] = await Promise.all([
      translateFromItalian(nameIt),
      translateFromItalian(descriptionIt),
    ])
    for (const [locale, name, desc, isAuto] of [
      ['it', nameIt, descriptionIt, false],
      ['en', nameT.en, descT.en, true],
      ['de', nameT.de, descT.de, true],
    ] as const) {
      await db
        .update(routeTranslations)
        .set({ name, description, startPointLabel, isAutoTranslated: isAuto, })
        .where(and(eq(routeTranslations.routeId, id), eq(routeTranslations.locale, locale)))
    }
  } else {
    await db
      .update(routeTranslations)
      .set({ name: nameIt, description: descriptionIt, startPointLabel })
      .where(and(eq(routeTranslations.routeId, id), eq(routeTranslations.locale, 'it')))
  }

  revalidatePath('/[lang]/percorsi', 'page')
  revalidatePath(`/[lang]/percorsi/${slug}`, 'page')
  redirect('/gestione/percorsi')
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteRouteAction(id: string) {
  await requireAdmin()

  const [route] = await db.select().from(routes).where(eq(routes.id, id))
  if (!route) return

  const photos = await db.select().from(routePhotos).where(eq(routePhotos.routeId, id))
  await Promise.all(photos.map((p) => deleteR2Object(p.storageKey)))
  if (route.gpxKey) await deleteR2Object(route.gpxKey)

  await db.delete(routes).where(eq(routes.id, id))

  revalidatePath('/[lang]/percorsi', 'page')
}

// ── PUBLISH TOGGLE ───────────────────────────────────────────────────────────

export async function togglePublishAction(id: string, isPublished: boolean) {
  await requireAdmin()
  const [route] = await db
    .update(routes)
    .set({ isPublished, updatedAt: new Date() })
    .where(eq(routes.id, id))
    .returning()

  revalidatePath('/[lang]/percorsi', 'page')
  if (route?.slug) revalidatePath(`/[lang]/percorsi/${route.slug}`, 'page')
}

// ── PRESIGNED URL per upload media ───────────────────────────────────────────

export async function getPresignedUploadUrlAction(
  routeId: string,
  fileName: string,
  contentType: string,
  type: 'photo' | 'gpx'
) {
  await requireAdmin()
  const ext = fileName.split('.').pop()
  const key = type === 'gpx'
    ? `route-gpx/${routeId}/track.gpx`
    : `route-photos/${routeId}/${crypto.randomUUID()}.${ext}`
  const url = await getPresignedUploadUrl(key, contentType)
  return { url, key }
}

// ── FOTO: salva ordine + aggiungi/rimuovi ─────────────────────────────────────

export async function savePhotosAction(
  routeId: string,
  photos: { storageKey: string; displayOrder: number; altText?: string }[]
) {
  await requireAdmin()
  await db.delete(routePhotos).where(eq(routePhotos.routeId, routeId))
  if (photos.length > 0) {
    await db.insert(routePhotos).values(
      photos.map((p) => ({ routeId, ...p }))
    )
  }
  const [route] = await db.select().from(routes).where(eq(routes.id, routeId))
  if (route?.slug) revalidatePath(`/[lang]/percorsi/${route.slug}`, 'page')
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```

---

## Task 12: Admin — lista percorsi

**Files:**
- Modify: `app/gestione/percorsi/page.tsx`
- Create: `components/admin/route-list-item.tsx`

- [ ] **Step 1: Crea `components/admin/route-list-item.tsx`**

```tsx
'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { deleteRouteAction, togglePublishAction } from '@/lib/actions/routes'
import type { Route } from '@/lib/db'

const difficultyLabel: Record<string, string> = {
  easy: 'Facile', medium: 'Medio', hard: 'Difficile', expert: 'Esperto'
}

export function RouteListItem({ route, name }: { route: Route; name: string }) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      await deleteRouteAction(route.id)
      toast.success('Percorso eliminato')
    })
  }

  function handleTogglePublish() {
    startTransition(async () => {
      await togglePublishAction(route.id, !route.isPublished)
      toast.success(route.isPublished ? 'Percorso nascosto' : 'Percorso pubblicato')
    })
  }

  return (
    <div className="flex items-center justify-between p-4 bg-card border rounded-lg">
      <div className="space-y-1 min-w-0">
        <p className="font-medium text-[#1e3a5f] truncate">{name}</p>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{difficultyLabel[route.difficulty]}</Badge>
          {route.distanceKm && <span>{route.distanceKm} km</span>}
          <Badge variant={route.isPublished ? 'default' : 'secondary'}>
            {route.isPublished ? 'Pubblicato' : 'Bozza'}
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 ml-4">
        <Button
          variant="ghost" size="icon"
          onClick={handleTogglePublish}
          disabled={isPending}
          title={route.isPublished ? 'Nascondi' : 'Pubblica'}
        >
          {route.isPublished ? <EyeOff size={16} /> : <Eye size={16} />}
        </Button>

        <Button variant="ghost" size="icon" asChild>
          <Link href={`/gestione/percorsi/${route.id}`}><Pencil size={16} /></Link>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
              <Trash2 size={16} />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare il percorso?</AlertDialogTitle>
              <AlertDialogDescription>
                Questa azione è irreversibile. Verranno eliminate anche tutte le foto e il file GPX.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Aggiorna `app/gestione/percorsi/page.tsx`**

```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { getRoutesForAdmin } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { db, routeTranslations } from '@/lib/db'
import { eq, and } from 'drizzle-orm'
import { RouteListItem } from '@/components/admin/route-list-item'
import { redirect } from 'next/navigation'

export default async function AdminPercorsiPage() {
  const user = await getAdminUser()
  if (!user) redirect('/gestione/login')

  const routesList = await getRoutesForAdmin()

  const namesMap = new Map<string, string>()
  await Promise.all(
    routesList.map(async (r) => {
      const [tr] = await db
        .select({ name: routeTranslations.name })
        .from(routeTranslations)
        .where(and(eq(routeTranslations.routeId, r.id), eq(routeTranslations.locale, 'it')))
      namesMap.set(r.id, tr?.name ?? r.slug)
    })
  )

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1e3a5f]">
          Percorsi ({routesList.length})
        </h1>
        <Button asChild className="bg-[#1e3a5f] hover:bg-[#152c4a]">
          <Link href="/gestione/percorsi/nuovo"><Plus size={16} className="mr-1" /> Nuovo percorso</Link>
        </Button>
      </div>

      {routesList.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nessun percorso ancora. Crea il primo!</p>
      ) : (
        <div className="space-y-3">
          {routesList.map((route) => (
            <RouteListItem key={route.id} route={route} name={namesMap.get(route.id) ?? route.slug} />
          ))}
        </div>
      )}
    </div>
  )
}
```

---

## Task 13: Admin — form percorso (nuovo + edit)

**Files:**
- Create: `components/admin/photo-upload.tsx`
- Create: `components/admin/gpx-upload.tsx`
- Create: `components/admin/route-form.tsx`
- Create: `app/gestione/percorsi/nuovo/page.tsx`
- Create: `app/gestione/percorsi/[id]/page.tsx`

- [ ] **Step 1: Crea `components/admin/gpx-upload.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileCheck } from 'lucide-react'
import { toast } from 'sonner'
import { getPresignedUploadUrlAction } from '@/lib/actions/routes'

interface GpxUploadProps {
  routeId: string
  defaultGpxKey?: string
  onUploaded: (key: string, stats: { distanceKm: number; elevationM: number }) => void
}

export function GpxUpload({ routeId, defaultGpxKey, onUploaded }: GpxUploadProps) {
  const [gpxKey, setGpxKey] = useState(defaultGpxKey ?? '')
  const [uploading, setUploading] = useState(false)

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'application/gpx+xml': ['.gpx'], 'text/xml': ['.gpx'] },
    maxFiles: 1,
    onDrop: async ([file]) => {
      if (!file) return
      setUploading(true)
      try {
        const { url, key } = await getPresignedUploadUrlAction(routeId, file.name, file.type || 'application/gpx+xml', 'gpx')
        await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/gpx+xml' } })

        const text = await file.text()
        const { parseGpxStats } = await import('@/lib/gpx')
        const stats = parseGpxStats(text)

        setGpxKey(key)
        onUploaded(key, stats)
        toast.success(`GPX caricato — ${stats.distanceKm} km, ↑${stats.elevationM} m`)
      } catch {
        toast.error('Errore nel caricamento GPX')
      } finally {
        setUploading(false)
      }
    },
  })

  return (
    <div>
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
        }`}
      >
        <input {...getInputProps()} />
        {gpxKey ? (
          <div className="flex items-center justify-center gap-2 text-sm text-green-600">
            <FileCheck size={18} /> File GPX caricato (clicca per sostituire)
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Upload size={18} />
            {uploading ? 'Caricamento...' : 'Trascina il file .gpx o clicca per selezionarlo'}
          </div>
        )}
      </div>
      <input type="hidden" name="gpxKey" value={gpxKey} />
    </div>
  )
}
```

- [ ] **Step 2: Crea `components/admin/photo-upload.tsx`**

```tsx
'use client'
import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, X, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { r2PublicUrl } from '@/lib/r2'
import { getPresignedUploadUrlAction } from '@/lib/actions/routes'

interface Photo { storageKey: string; preview: string }

function SortablePhoto({ photo, onRemove }: { photo: Photo; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: photo.storageKey })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-3 bg-card border rounded-lg p-2"
    >
      <button type="button" {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab">
        <GripVertical size={16} />
      </button>
      <img src={photo.preview} alt="" className="w-16 h-12 object-cover rounded" />
      <span className="text-xs text-muted-foreground flex-1 truncate">{photo.storageKey.split('/').pop()}</span>
      <button type="button" onClick={onRemove} className="text-destructive hover:text-destructive/80">
        <X size={14} />
      </button>
    </div>
  )
}

export function PhotoUpload({
  routeId,
  defaultPhotos = [],
}: {
  routeId: string
  defaultPhotos?: { storageKey: string }[]
}) {
  const [photos, setPhotos] = useState<Photo[]>(
    defaultPhotos.map((p) => ({ storageKey: p.storageKey, preview: r2PublicUrl(p.storageKey) }))
  )
  const [uploading, setUploading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setUploading(true)
    try {
      const newPhotos: Photo[] = []
      for (const file of acceptedFiles) {
        const { url, key } = await getPresignedUploadUrlAction(routeId, file.name, file.type, 'photo')
        await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
        newPhotos.push({ storageKey: key, preview: URL.createObjectURL(file) })
      }
      setPhotos((prev) => [...prev, ...newPhotos])
      toast.success(`${newPhotos.length} foto caricate`)
    } catch {
      toast.error('Errore nel caricamento foto')
    } finally {
      setUploading(false)
    }
  }, [routeId])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.webp', '.png'] },
    onDrop,
  })

  function handleDragEnd(event: { active: { id: string }; over: { id: string } | null }) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setPhotos((items) => {
        const oldIndex = items.findIndex((i) => i.storageKey === active.id)
        const newIndex = items.findIndex((i) => i.storageKey === over.id)
        return arrayMove(items, oldIndex, newIndex)
      })
    }
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd as Parameters<typeof DndContext>[0]['onDragEnd']}>
        <SortableContext items={photos.map((p) => p.storageKey)} strategy={verticalListSortingStrategy}>
          {photos.map((photo) => (
            <SortablePhoto
              key={photo.storageKey}
              photo={photo}
              onRemove={() => setPhotos((prev) => prev.filter((p) => p.storageKey !== photo.storageKey))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-[#366DA1] bg-blue-50' : 'border-muted hover:border-[#366DA1]'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Upload size={16} />
          {uploading ? 'Caricamento...' : 'Aggiungi foto (trascina o clicca)'}
        </div>
      </div>

      {photos.map((p, i) => (
        <input key={p.storageKey} type="hidden" name={`photoKeys[${i}]`} value={p.storageKey} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Crea `components/admin/route-form.tsx`**

```tsx
'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { GpxUpload } from './gpx-upload'
import { PhotoUpload } from './photo-upload'
import type { RouteFormState } from '@/lib/actions/routes'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

const BIKE_TYPES = ['eMTB', 'MTB', 'Road Bike', 'E-Road Bike', 'Gravel', 'E-Gravel', 'City Bike', 'E-City Bike']

interface RouteFormProps {
  action: (prev: RouteFormState, formData: FormData) => Promise<RouteFormState>
  route?: Route
  translations?: RouteTranslation[]
  photos?: RoutePhoto[]
}

export function RouteForm({ action, route, translations, photos }: RouteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const itTranslation = translations?.find((t) => t.locale === 'it')

  const [distanceKm, setDistanceKm] = useState(route?.distanceKm ?? '')
  const [elevationM, setElevationM] = useState(route?.elevationM?.toString() ?? '')

  function handleGpxUploaded(key: string, stats: { distanceKm: number; elevationM: number }) {
    setDistanceKm(stats.distanceKm.toString())
    setElevationM(stats.elevationM.toString())
  }

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      {/* Testi IT */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Contenuto (italiano)</h2>
        <p className="text-sm text-muted-foreground">EN e DE vengono generati automaticamente con Azure Translator al salvataggio.</p>

        <div className="space-y-1">
          <Label htmlFor="nameIt">Nome percorso *</Label>
          <Input id="nameIt" name="nameIt" required defaultValue={itTranslation?.name} />
          {state.errors?.nameIt && <p className="text-xs text-destructive">{state.errors.nameIt[0]}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="startPointLabel">Punto di partenza</Label>
          <Input id="startPointLabel" name="startPointLabel" placeholder="es. Dro, Via Roma 90" defaultValue={itTranslation?.startPointLabel ?? ''} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="descriptionIt">Descrizione *</Label>
          <Textarea id="descriptionIt" name="descriptionIt" rows={5} required defaultValue={itTranslation?.description} />
          {state.errors?.descriptionIt && <p className="text-xs text-destructive">{state.errors.descriptionIt[0]}</p>}
        </div>

        {route && (
          <div className="flex items-center gap-2 text-sm">
            <Switch name="retranslate" id="retranslate" value="true" />
            <Label htmlFor="retranslate">Rigenera traduzioni EN/DE (Azure)</Label>
          </div>
        )}
      </section>

      {/* Statistiche */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Statistiche</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="difficulty">Difficoltà *</Label>
            <Select name="difficulty" defaultValue={route?.difficulty ?? 'easy'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Facile</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="hard">Difficile</SelectItem>
                <SelectItem value="expert">Esperto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="surface">Fondo *</Label>
            <Select name="surface" defaultValue={route?.surface ?? 'mixed'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asphalt">Asfalto</SelectItem>
                <SelectItem value="dirt">Sterrato</SelectItem>
                <SelectItem value="mixed">Misto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="distanceKm">Distanza (km)</Label>
            <Input
              id="distanceKm" name="distanceKm" type="number" step="0.1" min="0"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="auto da GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="elevationM">Dislivello (m)</Label>
            <Input
              id="elevationM" name="elevationM" type="number" min="0"
              value={elevationM}
              onChange={(e) => setElevationM(e.target.value)}
              placeholder="auto da GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durationMin">Durata (minuti)</Label>
            <Input id="durationMin" name="durationMin" type="number" min="1" defaultValue={route?.durationMin ?? ''} placeholder="es. 180" />
          </div>
        </div>
      </section>

      {/* Tipo bici */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Tipo di bici *</h2>
        {state.errors?.bikeTypes && <p className="text-xs text-destructive">{state.errors.bikeTypes[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {BIKE_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`bike-${type}`}
                name="bikeTypes"
                value={type}
                defaultChecked={route?.bikeTypes.includes(type)}
              />
              <Label htmlFor={`bike-${type}`} className="font-normal">{type}</Label>
            </div>
          ))}
        </div>
      </section>

      {/* Link esterni */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Link esterni</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="stravaUrl">Strava URL</Label>
            <Input id="stravaUrl" name="stravaUrl" type="url" defaultValue={route?.stravaUrl ?? ''} placeholder="https://www.strava.com/routes/..." />
          </div>
          <div className="space-y-1">
            <Label htmlFor="komootUrl">Komoot URL</Label>
            <Input id="komootUrl" name="komootUrl" type="url" defaultValue={route?.komootUrl ?? ''} placeholder="https://www.komoot.com/tour/..." />
          </div>
        </div>
      </section>

      {/* GPX */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">File GPX</h2>
        <GpxUpload
          routeId={route?.id ?? 'new'}
          defaultGpxKey={route?.gpxKey ?? undefined}
          onUploaded={handleGpxUploaded}
        />
      </section>

      {/* Foto */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Galleria foto</h2>
        <p className="text-sm text-muted-foreground">La prima foto è la copertina. Trascina per riordinare.</p>
        <PhotoUpload
          routeId={route?.id ?? 'new'}
          defaultPhotos={photos ?? []}
        />
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]" disabled={isPending}>
          {isPending ? 'Salvataggio...' : route ? 'Aggiorna percorso' : 'Crea percorso'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Crea `app/gestione/percorsi/nuovo/page.tsx`**

```tsx
import { RouteForm } from '@/components/admin/route-form'
import { createRouteAction } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function NuovoPercorsoPage() {
  const user = await getAdminUser()
  if (!user) redirect('/gestione/login')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Nuovo percorso</h1>
      <RouteForm action={createRouteAction} />
    </div>
  )
}
```

- [ ] **Step 5: Crea `app/gestione/percorsi/[id]/page.tsx`**

```tsx
import { RouteForm } from '@/components/admin/route-form'
import { updateRouteAction } from '@/lib/actions/routes'
import { getRouteWithDetails } from '@/lib/actions/routes'
import { getAdminUser } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'

export default async function EditPercorsoPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUser()
  if (!user) redirect('/gestione/login')

  const { id } = await params
  const data = await getRouteWithDetails(id)
  if (!data) notFound()

  const action = updateRouteAction.bind(null, id)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-[#1e3a5f]">Modifica percorso</h1>
      <RouteForm
        action={action}
        route={data.route}
        translations={data.translations}
        photos={data.photos}
      />
    </div>
  )
}
```

- [ ] **Step 6: Build**

```bash
npm run build
```
Atteso: build verde.

- [ ] **Step 7: Commit**

```bash
git add app/gestione/ components/admin/ lib/actions/ lib/supabase/ lib/r2.ts
git commit -m "feat: add admin panel — login, sidebar, route CRUD, photo/GPX upload"
```

---

## Task 14: i18n messages per percorsi

**Files:**
- Modify: `messages/it.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `app/[lang]/dictionaries.ts`

- [ ] **Step 1: Aggiungi chiavi a `messages/it.json`**

Alla fine del JSON, prima della `}` di chiusura, aggiungi:

```json
  "percorsi": {
    "page_title": "Percorsi consigliati",
    "page_subtitle": "Esplora il Lago di Garda e le valli circostanti in e-bike o bici",
    "filter_all": "Tutti",
    "filter_difficulty": "Difficoltà",
    "difficulty_easy": "Facile",
    "difficulty_medium": "Medio",
    "difficulty_hard": "Difficile",
    "difficulty_expert": "Esperto",
    "surface_asphalt": "Asfalto",
    "surface_dirt": "Sterrato",
    "surface_mixed": "Misto",
    "stat_distance": "km",
    "stat_elevation": "↑ m",
    "stat_duration": "durata",
    "stat_surface": "fondo",
    "open_strava": "Apri su Strava",
    "open_komoot": "Apri su Komoot",
    "download_gpx": "Scarica GPX",
    "share": "Condividi",
    "share_copied": "Link copiato!",
    "back_to_list": "← Tutti i percorsi",
    "no_results": "Nessun percorso trovato con questi filtri.",
    "copyright_notice": "I percorsi sono proprietà esclusiva di Lelettrica di Leoni Gabriele. Tutti i diritti riservati.",
    "nav_label": "Percorsi"
  }
```

- [ ] **Step 2: Aggiungi chiavi a `messages/en.json`**

```json
  "percorsi": {
    "page_title": "Recommended routes",
    "page_subtitle": "Explore Lake Garda and the surrounding valleys by e-bike or bicycle",
    "filter_all": "All",
    "filter_difficulty": "Difficulty",
    "difficulty_easy": "Easy",
    "difficulty_medium": "Medium",
    "difficulty_hard": "Hard",
    "difficulty_expert": "Expert",
    "surface_asphalt": "Asphalt",
    "surface_dirt": "Dirt",
    "surface_mixed": "Mixed",
    "stat_distance": "km",
    "stat_elevation": "↑ m",
    "stat_duration": "duration",
    "stat_surface": "surface",
    "open_strava": "Open on Strava",
    "open_komoot": "Open on Komoot",
    "download_gpx": "Download GPX",
    "share": "Share",
    "share_copied": "Link copied!",
    "back_to_list": "← All routes",
    "no_results": "No routes found with these filters.",
    "copyright_notice": "Routes are the exclusive property of Lelettrica di Leoni Gabriele. All rights reserved.",
    "nav_label": "Routes"
  }
```

- [ ] **Step 3: Aggiungi chiavi a `messages/de.json`**

```json
  "percorsi": {
    "page_title": "Empfohlene Routen",
    "page_subtitle": "Erkunden Sie den Gardasee und die umliegenden Täler mit dem E-Bike oder Fahrrad",
    "filter_all": "Alle",
    "filter_difficulty": "Schwierigkeit",
    "difficulty_easy": "Leicht",
    "difficulty_medium": "Mittel",
    "difficulty_hard": "Schwer",
    "difficulty_expert": "Experte",
    "surface_asphalt": "Asphalt",
    "surface_dirt": "Schotter",
    "surface_mixed": "Gemischt",
    "stat_distance": "km",
    "stat_elevation": "↑ m",
    "stat_duration": "Dauer",
    "stat_surface": "Belag",
    "open_strava": "Auf Strava öffnen",
    "open_komoot": "Auf Komoot öffnen",
    "download_gpx": "GPX herunterladen",
    "share": "Teilen",
    "share_copied": "Link kopiert!",
    "back_to_list": "← Alle Routen",
    "no_results": "Keine Routen mit diesen Filtern gefunden.",
    "copyright_notice": "Routen sind ausschließliches Eigentum von Lelettrica di Leoni Gabriele. Alle Rechte vorbehalten.",
    "nav_label": "Routen"
  }
```

---

## Task 15: Pagina pubblica — lista percorsi

**Files:**
- Create: `app/[lang]/percorsi/page.tsx`
- Create: `components/route-card.tsx`
- Create: `components/route-filters.tsx`
- Modify: `components/navbar.tsx` (aggiungi link Percorsi)

- [ ] **Step 1: Crea `components/route-card.tsx`**

```tsx
import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { r2PublicUrl } from '@/lib/r2'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteCardProps {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
  lang: string
  dict: { percorsi: Record<string, string> }
}

const difficultyColor: Record<string, string> = {
  easy: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  hard: 'bg-orange-100 text-orange-800',
  expert: 'bg-red-100 text-red-800',
}

export function RouteCard({ route, translation, coverPhoto, lang, dict }: RouteCardProps) {
  const d = dict.percorsi
  const difficultyKey = `difficulty_${route.difficulty}` as keyof typeof d

  return (
    <Link
      href={`/${lang}/percorsi/${route.slug}`}
      className="group block rounded-xl overflow-hidden border bg-card hover:shadow-md transition-shadow"
    >
      <div className="relative h-48 bg-[#c8dae8]">
        {coverPhoto && (
          <Image
            src={r2PublicUrl(coverPhoto.storageKey)}
            alt={coverPhoto.altText ?? translation.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
        )}
        <span className={`absolute top-3 right-3 text-xs font-semibold px-2.5 py-1 rounded-full ${difficultyColor[route.difficulty]}`}>
          {d[difficultyKey] ?? route.difficulty}
        </span>
      </div>

      <div className="p-4 space-y-3">
        <h3 className="font-bold text-[#1e3a5f] line-clamp-2 group-hover:text-[#366DA1] transition-colors">
          {translation.name}
        </h3>

        <div className="flex flex-wrap gap-1.5">
          {route.bikeTypes.map((type) => (
            <Badge key={type} variant="secondary" className="text-xs">{type}</Badge>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 bg-muted/50 rounded-lg p-2.5">
          {route.distanceKm && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{route.distanceKm}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_distance}</p>
            </div>
          )}
          {route.elevationM != null && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{route.elevationM}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_elevation}</p>
            </div>
          )}
          {route.durationMin && (
            <div className="text-center">
              <p className="text-sm font-bold text-[#1e3a5f]">{Math.round(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}</p>
              <p className="text-[10px] text-muted-foreground">{d.stat_duration}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-sm font-bold text-[#1e3a5f] capitalize">{d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}</p>
            <p className="text-[10px] text-muted-foreground">{d.stat_surface}</p>
          </div>
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Crea `components/route-filters.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { RouteCard } from './route-card'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

interface RouteWithData {
  route: Route
  translation: RouteTranslation
  coverPhoto: RoutePhoto | undefined
}

interface RouteFiltersProps {
  routes: RouteWithData[]
  lang: string
  dict: { percorsi: Record<string, string> }
}

const DIFFICULTY_KEYS = ['easy', 'medium', 'hard', 'expert'] as const
const BIKE_TYPES = ['eMTB', 'MTB', 'Road Bike', 'E-Road Bike', 'Gravel', 'E-Gravel', 'City Bike', 'E-City Bike']

export function RouteFilters({ routes, lang, dict }: RouteFiltersProps) {
  const d = dict.percorsi
  const [activeDifficulty, setActiveDifficulty] = useState<string | null>(null)
  const [activeBikeType, setActiveBikeType] = useState<string | null>(null)

  const filtered = routes.filter(({ route }) => {
    if (activeDifficulty && route.difficulty !== activeDifficulty) return false
    if (activeBikeType && !route.bikeTypes.includes(activeBikeType)) return false
    return true
  })

  const availableBikeTypes = [...new Set(routes.flatMap((r) => r.route.bikeTypes))]
    .filter((t) => BIKE_TYPES.includes(t))

  function toggle<T extends string>(current: T | null, value: T, set: (v: T | null) => void) {
    set(current === value ? null : value)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'filter_routes', { filter_type: 'difficulty', filter_value: value })
    }
  }

  return (
    <div className="space-y-6">
      {/* Filtri */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted-foreground self-center mr-1">{d.filter_difficulty}:</span>
          {DIFFICULTY_KEYS.map((d_key) => (
            <button
              key={d_key}
              onClick={() => toggle(activeDifficulty, d_key, setActiveDifficulty)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                activeDifficulty === d_key
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-background text-muted-foreground border-border hover:border-[#366DA1]'
              )}
            >
              {d[`difficulty_${d_key}` as keyof typeof d]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-muted-foreground self-center mr-1">Bici:</span>
          {availableBikeTypes.map((type) => (
            <button
              key={type}
              onClick={() => toggle(activeBikeType, type, setActiveBikeType)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                activeBikeType === type
                  ? 'bg-[#366DA1] text-white border-[#366DA1]'
                  : 'bg-background text-muted-foreground border-border hover:border-[#366DA1]'
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {/* Griglia */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">{d.no_results}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {filtered.map(({ route, translation, coverPhoto }) => (
            <RouteCard
              key={route.id}
              route={route}
              translation={translation}
              coverPhoto={coverPhoto}
              lang={lang}
              dict={dict}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Crea `app/[lang]/percorsi/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RouteFilters } from '@/components/route-filters'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'

export const revalidate = 3600

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.percorsi.page_title,
    description: dict.percorsi.page_subtitle,
    alternates: {
      canonical: `${siteUrl}/${lang}/percorsi`,
      languages: {
        it: `${siteUrl}/it/percorsi`,
        en: `${siteUrl}/en/percorsi`,
        de: `${siteUrl}/de/percorsi`,
        'x-default': `${siteUrl}/it/percorsi`,
      },
    },
  }
}

export default async function PercorsiPage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)

  const publishedRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.isPublished, true))

  type RouteWithData = {
    route: typeof publishedRoutes[0]
    translation: typeof routeTranslations.$inferSelect
    coverPhoto: typeof routePhotos.$inferSelect | undefined
  }

  const routesWithData: RouteWithData[] = (
    await Promise.all(
      publishedRoutes.map(async (route) => {
        const [translation] = await db
          .select()
          .from(routeTranslations)
          .where(and(
            eq(routeTranslations.routeId, route.id),
            eq(routeTranslations.locale, lang as 'it' | 'en' | 'de')
          ))

        const [coverPhoto] = await db
          .select()
          .from(routePhotos)
          .where(and(eq(routePhotos.routeId, route.id), eq(routePhotos.displayOrder, 0)))

        return translation ? { route, translation, coverPhoto } : null
      })
    )
  ).filter((i): i is RouteWithData => i !== null)

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.percorsi.page_title,
    url: `${siteUrl}/${lang}/percorsi`,
    numberOfItems: routesWithData.length,
    itemListElement: routesWithData.map(({ route, translation }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/percorsi/${route.slug}`,
      name: translation?.name ?? route.slug,
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      <main className="max-w-5xl mx-auto px-4 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.percorsi.page_title}</h1>
          <p className="text-muted-foreground mt-2">{dict.percorsi.page_subtitle}</p>
        </div>

        <RouteFilters routes={routesWithData} lang={lang} dict={dict} />

        <p className="text-xs text-muted-foreground border-t pt-4">{dict.percorsi.copyright_notice}</p>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

- [ ] **Step 4: Aggiorna `components/navbar.tsx`**

Sostituisci il contenuto di `components/navbar.tsx`:

```tsx
import Image from 'next/image'
import Link from 'next/link'
import { LanguageSwitcher } from './language-switcher'

interface NavbarProps {
  lang: string
  dict: {
    nav: { services: string; pricing: string; contact: string }
    percorsi?: { nav_label: string }
  }
}

export function Navbar({ lang, dict }: NavbarProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-border/50 shadow-sm">
      <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href={`/${lang}`} className="flex items-center shrink-0">
          <Image
            src="/svg/LogoLelettrica_full.svg"
            alt="Lelettrica"
            width={160}
            height={50}
            priority
            className="h-9 w-auto"
          />
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <Link href={`/${lang}#servizi`} className="hover:text-primary transition-colors">
            {dict.nav.services}
          </Link>
          <Link href={`/${lang}#prezzi`} className="hover:text-primary transition-colors">
            {dict.nav.pricing}
          </Link>
          {dict.percorsi && (
            <Link href={`/${lang}/percorsi`} className="hover:text-primary transition-colors">
              {dict.percorsi.nav_label}
            </Link>
          )}
          <Link href={`/${lang}#contatti`} className="hover:text-primary transition-colors">
            {dict.nav.contact}
          </Link>
        </div>

        <LanguageSwitcher currentLang={lang} />
      </nav>
    </header>
  )
}
```

- [ ] **Step 5: Build**

```bash
npm run build
```

---

## Task 16: Pagina pubblica — dettaglio percorso

**Files:**
- Create: `app/[lang]/percorsi/[slug]/page.tsx`
- Create: `components/route-gallery.tsx`
- Create: `components/route-share-button.tsx`

- [ ] **Step 1: Crea `components/route-share-button.tsx`**

```tsx
'use client'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function RouteShareButton({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  function handleShare() {
    navigator.clipboard.writeText(url)
    toast.success(copiedLabel)
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'share_route', { method: 'copy_link', url })
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      <Share2 size={14} className="mr-1.5" /> {label}
    </Button>
  )
}
```

- [ ] **Step 2: Crea `components/route-gallery.tsx`**

```tsx
'use client'
import { useState } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { r2PublicUrl } from '@/lib/r2'
import type { RoutePhoto } from '@/lib/db'

export function RouteGallery({ photos, routeName }: { photos: RoutePhoto[]; routeName: string }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  if (photos.length === 0) return null

  const slides = photos.map((p) => ({ src: r2PublicUrl(p.storageKey) }))

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => { setIndex(i); setOpen(true) }}
            className="relative aspect-video rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
          >
            <Image
              src={r2PublicUrl(photo.storageKey)}
              alt={photo.altText ?? `${routeName} foto ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
          </button>
        ))}
      </div>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={slides}
      />
    </>
  )
}
```

- [ ] **Step 3: Crea `app/[lang]/percorsi/[slug]/page.tsx`**

```tsx
import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { eq, and } from 'drizzle-orm'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RouteGallery } from '@/components/route-gallery'
import { RouteShareButton } from '@/components/route-share-button'
import { db, routes, routeTranslations, routePhotos } from '@/lib/db'
import { r2PublicUrl } from '@/lib/r2'

export const revalidate = 3600

export async function generateStaticParams() {
  const published = await db.select({ slug: routes.slug }).from(routes).where(eq(routes.isPublished, true))
  const langs = ['it', 'en', 'de']
  return langs.flatMap((lang) => published.map(({ slug }) => ({ lang, slug })))
}

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; slug: string }> }): Promise<Metadata> {
  const { lang, slug } = await params
  if (!hasLocale(lang)) return {}

  const [route] = await db.select().from(routes).where(and(eq(routes.slug, slug), eq(routes.isPublished, true)))
  if (!route) return {}

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )
  const [coverPhoto] = await db.select().from(routePhotos).where(
    and(eq(routePhotos.routeId, route.id), eq(routePhotos.displayOrder, 0))
  )

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? slug
  const description = translation?.description?.slice(0, 155) ?? ''
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage }], url: `${siteUrl}/${lang}/percorsi/${slug}` },
    alternates: {
      canonical: `${siteUrl}/${lang}/percorsi/${slug}`,
      languages: {
        it: `${siteUrl}/it/percorsi/${slug}`,
        en: `${siteUrl}/en/percorsi/${slug}`,
        de: `${siteUrl}/de/percorsi/${slug}`,
        'x-default': `${siteUrl}/it/percorsi/${slug}`,
      },
    },
  }
}

export default async function RouteDetailPage({
  params,
}: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, slug } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const d = dict.percorsi

  const [route] = await db.select().from(routes).where(and(eq(routes.slug, slug), eq(routes.isPublished, true)))
  if (!route) notFound()

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang as 'it' | 'en' | 'de'))
  )

  const photos = await db.select().from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  const coverPhoto = photos[0]

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const difficultyLabel: Record<string, string> = {
    easy: d.difficulty_easy, medium: d.difficulty_medium,
    hard: d.difficulty_hard, expert: d.difficulty_expert,
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ExercisePlan',
    name: translation?.name ?? slug,
    description: translation?.description,
    url: `${siteUrl}/${lang}/percorsi/${slug}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    exerciseType: 'Cycling',
    associatedAnatomy: route.bikeTypes,
    provider: { '@type': 'LocalBusiness', name: 'Lelettrica di Leoni Gabriele', url: siteUrl },
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} />
      <main className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Back */}
        <Link href={`/${lang}/percorsi`} className="text-sm text-muted-foreground hover:text-[#366DA1]">
          {d.back_to_list}
        </Link>

        {/* Hero */}
        {coverPhoto && (
          <div className="relative h-64 sm:h-80 rounded-2xl overflow-hidden">
            <Image
              src={r2PublicUrl(coverPhoto.storageKey)}
              alt={translation?.name ?? slug}
              fill
              className="object-cover"
              priority
              sizes="(max-width: 1024px) 100vw, 896px"
            />
            <span className={`absolute top-4 right-4 text-sm font-semibold px-3 py-1.5 rounded-full bg-white/90 text-[#1e3a5f]`}>
              {difficultyLabel[route.difficulty]}
            </span>
          </div>
        )}

        {/* Title + bike types */}
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-[#1e3a5f]">
            {translation?.name ?? slug}
          </h1>
          <div className="flex flex-wrap gap-2">
            {route.bikeTypes.map((type) => (
              <Badge key={type} variant="secondary">{type}</Badge>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/40 rounded-xl p-4">
          {route.distanceKm && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">{route.distanceKm}</p>
              <p className="text-xs text-muted-foreground">{d.stat_distance}</p>
            </div>
          )}
          {route.elevationM != null && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">{route.elevationM}</p>
              <p className="text-xs text-muted-foreground">{d.stat_elevation}</p>
            </div>
          )}
          {route.durationMin && (
            <div className="text-center">
              <p className="text-2xl font-bold text-[#1e3a5f]">
                {Math.floor(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}
              </p>
              <p className="text-xs text-muted-foreground">{d.stat_duration}</p>
            </div>
          )}
          <div className="text-center">
            <p className="text-2xl font-bold text-[#1e3a5f] capitalize">
              {d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}
            </p>
            <p className="text-xs text-muted-foreground">{d.stat_surface}</p>
          </div>
        </div>

        {/* Start point */}
        {translation?.startPointLabel && (
          <p className="text-sm text-muted-foreground">📍 {translation.startPointLabel}</p>
        )}

        {/* Description */}
        {translation?.description && (
          <div className="prose prose-slate max-w-none">
            <p className="text-base leading-relaxed">{translation.description}</p>
          </div>
        )}

        {/* Gallery */}
        {photos.length > 0 && (
          <section className="space-y-3">
            <RouteGallery photos={photos} routeName={translation?.name ?? slug} />
          </section>
        )}

        {/* Links + Share */}
        <div className="flex flex-wrap gap-3 pt-4 border-t">
          {route.stravaUrl && (
            <Button asChild variant="outline" size="sm" className="border-orange-400 text-orange-600 hover:bg-orange-50"
              onClick={() => typeof window !== 'undefined' && window.gtag?.('event', 'open_strava', { route: slug })}>
              <a href={route.stravaUrl} target="_blank" rel="noopener noreferrer">{d.open_strava}</a>
            </Button>
          )}
          {route.komootUrl && (
            <Button asChild variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50"
              onClick={() => typeof window !== 'undefined' && window.gtag?.('event', 'open_komoot', { route: slug })}>
              <a href={route.komootUrl} target="_blank" rel="noopener noreferrer">{d.open_komoot}</a>
            </Button>
          )}
          {route.gpxKey && (
            <Button asChild variant="outline" size="sm"
              onClick={() => typeof window !== 'undefined' && window.gtag?.('event', 'download_gpx', { route: slug })}>
              <a href={`/api/percorsi/${slug}/gpx`} download>{d.download_gpx}</a>
            </Button>
          )}
          <RouteShareButton
            url={`${siteUrl}/${lang}/percorsi/${slug}`}
            label={d.share}
            copiedLabel={d.share_copied}
          />
        </div>

        <p className="text-xs text-muted-foreground">{d.copyright_notice}</p>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

---

## Task 17: GPX download handler (watermark)

**Files:**
- Create: `app/api/percorsi/[slug]/gpx/route.ts`

- [ ] **Step 1: Crea `app/api/percorsi/[slug]/gpx/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db, routes, routeTranslations } from '@/lib/db'
import { r2PublicUrl } from '@/lib/r2'
import { watermarkGpx } from '@/lib/gpx'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  const [route] = await db.select().from(routes).where(
    and(eq(routes.slug, slug), eq(routes.isPublished, true))
  )

  if (!route?.gpxKey) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, 'it'))
  )

  const gpxUrl = r2PublicUrl(route.gpxKey)
  const gpxResponse = await fetch(gpxUrl)
  if (!gpxResponse.ok) {
    return new NextResponse('GPX file not found', { status: 404 })
  }

  const gpxString = await gpxResponse.text()
  const watermarked = watermarkGpx(gpxString, translation?.name ?? slug)

  return new NextResponse(watermarked, {
    headers: {
      'Content-Type': 'application/gpx+xml',
      'Content-Disposition': `attachment; filename="${slug}.gpx"`,
      'Cache-Control': 'no-store',
    },
  })
}
```

---

## Task 18: Sitemap update + Next.js Image config

**Files:**
- Modify: `app/sitemap.ts`
- Modify: `next.config.ts` (o `next.config.js`)

- [ ] **Step 1: Aggiungi percorsi alla sitemap — `app/sitemap.ts`**

```ts
import type { MetadataRoute } from 'next'
import { eq } from 'drizzle-orm'
import { db, routes, routeTranslations } from '@/lib/db'

const BASE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']
const LAST_MODIFIED = new Date('2026-04-20')

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '',          priority: 1.0, freq: 'weekly'  },
    { path: '/percorsi', priority: 0.9, freq: 'weekly'  },
    { path: '/privacy',  priority: 0.3, freq: 'monthly' },
  ]

  const staticEntries = staticRoutes.flatMap(({ path, priority, freq }) =>
    locales.map((lang) => ({
      url: `${BASE_URL}/${lang}${path}`,
      lastModified: LAST_MODIFIED,
      changeFrequency: freq,
      priority,
      alternates: {
        languages: {
          ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}${path}`])),
          'x-default': `${BASE_URL}/it${path}`,
        },
      },
    }))
  )

  let dynamicEntries: MetadataRoute.Sitemap = []
  try {
    const publishedRoutes = await db
      .select({ id: routes.id, slug: routes.slug, updatedAt: routes.updatedAt })
      .from(routes)
      .where(eq(routes.isPublished, true))

    dynamicEntries = publishedRoutes.flatMap((route) =>
      locales.map((lang) => ({
        url: `${BASE_URL}/${lang}/percorsi/${route.slug}`,
        lastModified: route.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.7,
        alternates: {
          languages: {
            ...Object.fromEntries(locales.map((l) => [l, `${BASE_URL}/${l}/percorsi/${route.slug}`])),
            'x-default': `${BASE_URL}/it/percorsi/${route.slug}`,
          },
        },
      }))
    )
  } catch {}

  return [...staticEntries, ...dynamicEntries]
}
```

- [ ] **Step 2: Aggiungi Remote Pattern R2 per Next.js Image**

Leggi `next.config.ts` (o `next.config.js`) e aggiungi `images.remotePatterns` con il dominio R2 pubblico:

```ts
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 3: Build finale**

```bash
npm run build
```
Atteso: build verde, sitemap generata, nessun errore TypeScript.

- [ ] **Step 4: Commit finale**

```bash
git add .
git commit -m "feat: add public routes pages, GPX handler, sitemap, admin CRUD — complete percorsi feature"
```

---

## Task 19: Dichiarazione globale `window.gtag` per TypeScript

**Files:**
- Create: `types/gtag.d.ts`

- [ ] **Step 1: Crea `types/gtag.d.ts`**

```ts
interface Window {
  gtag?: (command: string, action: string, params?: Record<string, unknown>) => void
}
```

- [ ] **Step 2: Verifica TypeScript**

```bash
npx tsc --noEmit
```
Atteso: zero errori.

- [ ] **Step 3: Commit**

```bash
git add types/
git commit -m "fix: add gtag type declaration for TypeScript"
```

---

## Checklist finale pre-PR

- [ ] `npm test` → tutti i test GPX passano
- [ ] `npm run build` → build verde senza errori
- [ ] Login admin funziona su `/gestione/login`
- [ ] CRUD percorsi funziona (crea, modifica, elimina, pubblica)
- [ ] Upload foto + GPX funzionano
- [ ] Traduzione automatica Azure funziona
- [ ] Pagina `/it/percorsi` mostra percorsi pubblicati con filtri
- [ ] Pagina `/it/percorsi/[slug]` mostra dettaglio, gallery, stats
- [ ] Download GPX contiene watermark Lelettrica
- [ ] `window.gtag` events sparano correttamente
- [ ] `/gestione` → redirige a `/gestione/login` senza sessione
- [ ] robots.txt esclude `/gestione/`
- [ ] sitemap include i percorsi pubblicati
- [ ] Aprire PR su `main` dal branch `feature/percorsi-admin`
