# Routes Caching via Cache Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public site's routes pages (list, detail) and home page actually cacheable — today `export const revalidate = 3600` on the routes list is dead code because the root layout reads `headers()` for the locale, which forces the whole tree to render on demand on every request.

**Architecture:** Move the locale from an injected `x-locale` header to the `[lang]` URL segment itself (known at build time), so `app/[lang]/layout.tsx` becomes the root layout (`<html>/<body>`) instead of `app/layout.tsx`. Enable Next 16 Cache Components (`cacheComponents: true`) and wrap each page's data fetch (DB query + feature-flag check, folded into one function) in `"use cache"` with a short `cacheLife` and a `cacheTag`, so admin publish actions can force-refresh via `updateTag()` instead of waiting on a TTL. Everything outside the public site (`/manage`, `/login`, `/update-password`, `/privacy`) is opted out of the new validation with `instant = false` and left exactly as dynamic as it is today.

**Tech Stack:** Next.js 16.3.4 (App Router, Cache Components / `"use cache"` / `cacheLife` / `cacheTag` / `updateTag`), Drizzle ORM, TypeScript, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-routes-caching-cache-components-design.md`

## Global Constraints

- Never commit directly to `main` or `staging` — every task's commit lands on the feature branch created in Task 1; a PR opens at the end.
- `next dev`/`next build` always run with `--webpack` (already wired into `npm run dev` / `npm run build`) — never pass `--turbopack`, it doesn't exist here and the project's Cesium webpack config is ignored under Turbopack anyway.
- Code, identifiers, comments in English. Only `messages/{it,en,de}.json` content is in Italian — this plan touches no user-facing copy.
- `app/manage/**` (admin), `app/[lang]/login`, `app/[lang]/update-password`, `app/[lang]/privacy` stay fully dynamic — no caching logic added to any of them in this plan, only the mechanical `instant = false` opt-out and (for `/manage` only) a new `<html>/<body>` wrapper.
- Measure before declaring done: response time of `/it/routes` and `/it` before/after, not just a green build — this project has a documented incident where a "verified" migration made the home page 40x slower.

---

### Task 1: Branch, enable Cache Components, opt everything out

**Files:**
- Modify: `next.config.ts`
- Create/modify: every file under `app/` gains `export const instant = false` (via codemod)

**Interfaces:**
- Produces: `cacheComponents: true` and a `routesFlags` cache-life profile (`stale: 30, revalidate: 30, expire: 120`) available to every later task via `import { cacheLife } from 'next/cache'; cacheLife('routesFlags')`.

- [ ] **Step 1: Create the feature branch**

```bash
git checkout main
git pull
git checkout -b feat/routes-caching-cache-components
```

- [x] **Step 2: Add the flags and the custom cache profile to `next.config.ts`**

Add to the `nextConfig` object (keep every existing key — `webpack`, `images`, `redirects`):

```ts
const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    globalNotFound: true,
  },
  cacheLife: {
    // Matches the ~30s in-memory TTL lib/flags.ts already uses, so a
    // kill-switch reaches visitors about as fast as it does today.
    routesFlags: {
      stale: 30,
      revalidate: 30,
      expire: 120,
    },
  },
  webpack: (config) => { /* keep today's next.config.ts lines 4-36 verbatim */ },
  images: { /* keep today's next.config.ts lines 37-59 verbatim */ },
  async redirects() { /* keep today's next.config.ts lines 60-69 verbatim */ },
}
```

- [x] **Step 3: Try the build — expect it to fail**

```bash
npm run build
```

Expected: fails. `app/[lang]/routes/page.tsx`'s `export const revalidate = 3600` is now an
invalid route segment config under Cache Components, and `headers()` in `app/layout.tsx`
is read outside any `<Suspense>`.

Confirmed exactly as expected — the build failed on `revalidate` first (webpack stops at
the first compile error, so the `headers()` issue didn't show yet).

- [x] **Step 3b (discovered during execution, not in the original plan): `lib/flags.ts`
  calls `Date.now()` on every cache check.** After the codemod (Step 4) and removing
  `revalidate` (Step 5), the build still failed — not on `headers()` as expected, but on
  `Date.now()` inside `getFlags()`'s staleness check
  (`if (Date.now() - cache.at > CACHE_TTL_MS ...)`). Next 16 treats a raw `Date.now()`/
  `new Date()` read during prerendering as an unstable value and fails the build
  **regardless of `instant = false`** — that opt-out only covers uncached IO and runtime
  APIs, not synchronous non-determinism, which "can't be deferred"
  (`node_modules/next/dist/docs/.../migrating-to-cache-components.md`, "Adopting
  incrementally", step 3). It broke every route that both calls `getFlags()` and doesn't
  already have some other reason to be fully dynamic — home, privacy, routes list (found
  via `npm run build -- --debug-prerender`, which names the exact line and every failing
  route). `/manage/**` and `/[lang]/login`, `/[lang]/update-password` were unaffected:
  they're already fully dynamic for other reasons (session cookies, `searchParams`), so
  Next never attempts a static shell for them and never reaches this line.

  Fixed at the source, once, for every caller: swapped `Date.now()` for `performance.now()`
  in `lib/flags.ts` (both where `cache.at` is set — was line 210 — and where it's compared
  — was line 239). It's only ever used for an elapsed-time delta against `CACHE_TTL_MS`,
  never a wall-clock value, so the monotonic clock is equivalent and isn't flagged as
  unstable. No behavior change, no type change (`cache.at` was already a bare `number`).

- [x] **Step 4: Opt every route out of validation**

```bash
npx @next/codemod@canary cache-components-instant-false ./app
```

Ran successfully: 20 files modified, 17 unmodified, 0 errors. (Required a clean git tree
first — committed the `next.config.ts` change from Step 2 on its own before running this,
since the codemod refuses to run over uncommitted changes.)

- [x] **Step 5: Remove `export const revalidate = 3600` from the routes list**

File: `app/[lang]/routes/page.tsx` — deleted.

- [x] **Step 6: Build again — expect success**

```bash
npm run build
```

Succeeded once Step 3b's fix was in place. Build output confirms the intended baseline:
every route still shows `ƒ` (fully dynamic) except `/[lang]/routes/[id]` and
`/manage/routes/[id]`, which already show `◐` (partial prerender) — worth a look when
Task 8 converts the detail page, but not investigated now; out of scope for this task.

- [x] **Step 7: Commit**

Committed in two pieces rather than one, since Step 4's codemod required the config change
to be committed first:
1. `next.config.ts` — "Enable Cache Components and a routesFlags cache-life profile"
2. `lib/flags.ts`, the codemod's `instant = false` additions across `app/`, and the
   `revalidate` removal — pending, see below.

---

### Task 2: Remove the dead top-level login routes

**Files:**
- Delete: `app/login/page.tsx`, `app/login/layout.tsx`, `app/login/login-form.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing other tasks depend on — this is cleanup that has to happen before
  Task 4, because once `app/layout.tsx` is deleted, `app/login/` would otherwise need its
  own `<html>/<body>` like `app/manage/` does, for a route nothing can ever reach.

**Why it's dead**: `proxy.ts`'s matcher does not exclude `/login`, so every request to it
hits the i18n block and gets 301-redirected to `/{locale}/login` before Next's router ever
resolves `app/login/page.tsx`. That page is itself just `redirect('/it/login')` — a
redirect to a route the request never reaches. `app/manage/login/page.tsx` (kept — it's
under `/manage`, in scope for nothing in this plan) redirects to `/login`, which still
works after deletion: that redirect goes through the browser and re-enters `proxy.ts`,
which resolves it to `/it/login` regardless of whether `app/login/page.tsx` exists.

- [x] **Step 1: Confirm the route is unreachable**

```bash
npm run dev
```

In another terminal:

```bash
curl -sI http://localhost:3000/login
```

Expected: `HTTP/1.1 308` (or 301) `location: /it/login` — proxy redirects before the page
ever renders. Stop the dev server.

- [x] **Step 2: Delete the three files**

```bash
git rm app/login/page.tsx app/login/layout.tsx app/login/login-form.tsx
```

- [x] **Step 3: Confirm the app still builds**

Needed `rm -rf .next` first — a stale `.next/dev` type-check cache from the dev server run
in Step 1 still referenced the deleted `app/login/page.js`/`layout.js` and failed
typecheck. Not a real regression, just the CLAUDE.md-documented trap about comparing
against a stale `.next`. After clearing it, `npm run build` succeeded and `/login` is gone
from the route table (`/manage/login` still present, unaffected).

- [x] **Step 4: Commit**

Committed as `382b5fd`.

---

### Task 3: Restructure the not-found pages

**Files:**
- Create: `components/not-found-page.tsx`
- Create: `app/[lang]/not-found.tsx`
- Create: `app/global-not-found.tsx`
- Delete: `app/not-found.tsx`

**Interfaces:**
- Produces: `NotFoundPage` component (no props) that both new files render.

This has to land before Task 4 deletes `app/layout.tsx` — once that root layout is gone,
`app/not-found.tsx` has no `<html>/<body>` to render into.

- [x] **Step 1: Extract the existing markup into a shared component**

Create `components/not-found-page.tsx` with the exact content of today's
`app/not-found.tsx` (imports of `Link`, `Image`, `MapPin`, `ArrowLeft`, `Button` unchanged),
minus the `metadata` export:

```tsx
import Link from 'next/link'
import Image from 'next/image'
import { MapPin, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <Image
        src="/svg/LogoLelettrica_full.svg"
        alt="Lelettrica"
        width={320}
        height={100}
        className="mb-12 h-20 sm:h-28 w-auto opacity-80"
      />
      <p className="text-[9rem] sm:text-[12rem] font-black leading-none text-primary/10 select-none tabular-nums">
        404
      </p>
      <div className="-mt-4 space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Pagina non trovata
        </h1>
        <p className="text-muted-foreground max-w-sm mx-auto">
          La pagina che cerchi non esiste o è stata spostata.
          Torna alla home per trovare tutte le informazioni sul noleggio e-bike.
        </p>
      </div>
      <div className="mt-10 flex flex-col sm:flex-row gap-3 items-center">
        <Button asChild size="lg" className="gap-2">
          <Link href="/it">
            <ArrowLeft size={18} />
            Torna alla home
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="gap-2">
          <a href="tel:+393381232434">
            <MapPin size={18} />
            Chiamaci
          </a>
        </Button>
      </div>
      <p className="mt-12 text-xs text-muted-foreground/60">
        Via Roma 90, Dro (TN) · +39 338 123 2434
      </p>
    </div>
  )
}
```

(The hardcoded `/it` link and Italian-only copy are pre-existing behaviour, not something
this plan is scoped to fix — `app/not-found.tsx` was already like this for every locale.)

- [x] **Step 2: Create the in-tree not-found for `[lang]` routes**

This one inherits `<html lang>` from `app/[lang]/layout.tsx` (Task 4) — no `<html>/<body>`
of its own:

```tsx
// app/[lang]/not-found.tsx
import { NotFoundPage } from '@/components/not-found-page'

export const metadata = { title: '404 - Pagina non trovata | Lelettrica' }

export default function NotFound() {
  return <NotFoundPage />
}
```

- [x] **Step 3: Create the true global not-found**

For requests that match no route at all, outside `[lang]` and outside `/manage` (Next
"skips rendering" and serves this directly — see
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`).
It must import its own globals and render a full document:

```tsx
// app/global-not-found.tsx
import './globals.css'
import { Geist } from 'next/font/google'
import { NotFoundPage } from '@/components/not-found-page'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata = { title: '404 - Pagina non trovata | Lelettrica' }

export default function GlobalNotFound() {
  return (
    <html lang="it" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        <NotFoundPage />
      </body>
    </html>
  )
}
```

- [x] **Step 4: Delete the old top-level not-found**

Git recorded it as a 94% rename into `components/not-found-page.tsx` rather than a
separate delete — same net effect.

- [x] **Step 5: Build and manually check both paths**

Corrected the manual check from what the plan wrote: `curl -sI
http://localhost:3000/this-matches-nothing-at-all` does **not** reach
`global-not-found` — `proxy.ts` redirects every non-excluded, non-locale-prefixed path
to `/{locale}${pathname}` first (confirmed: `301` → `/it/this-matches-nothing-at-all`,
which then genuinely 404s, but via `app/[lang]/not-found.tsx`, not the global one). The
global one only renders for a path proxy's matcher excludes outright — verified with
`/images/nonexistent-file.png` (excluded: `images/.*` is in the matcher's negative
lookahead), which returns `lang="it"` and the not-found copy. Both confirmed working;
the plan's example curl for "global" was pointed at the wrong kind of path.

- [x] **Step 6: Commit**

Committed as `8893c55`.

---

### Task 4: Move the root layout into `app/[lang]/layout.tsx`

**Files:**
- Modify: `app/[lang]/layout.tsx`
- Delete: `app/layout.tsx`

**Interfaces:**
- Produces: `app/[lang]/layout.tsx` is now the root layout for every `[lang]` route —
  `<html lang={lang}>`, GA4, cookie consent, Geist font, the `LocalBusiness` JSON-LD (all of
  it moved verbatim from `app/layout.tsx`, nothing rewritten).

- [x] **Step 1: Merge `app/layout.tsx`'s content into `app/[lang]/layout.tsx`**

Replace the whole file. This keeps every existing export (`generateStaticParams`,
`generateMetadata` — SEO titles/descriptions/keywords/JSON-LD business schema, unchanged)
and adds what used to live in `app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import { Geist } from 'next/font/google'
import Script from 'next/script'
import { CookieConsentInit } from '@/components/cookie-consent'
import { hasLocale } from './dictionaries'
import { notFound } from 'next/navigation'
import '../globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
const locales = ['it', 'en', 'de']

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }))
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#366DA1',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  // Keep this function's body byte-for-byte identical to today's
  // app/[lang]/layout.tsx lines 12-169 (the titles/descriptions/keywords
  // records, the openGraph/twitter/alternates/robots object). Nothing in
  // this task changes it — copy it verbatim, don't retype it by hand.
}

// Keep `const jsonLd = { ... }` (today's app/[lang]/layout.tsx lines
// 171-292, the LocalBusiness/BikeShop schema) verbatim, unchanged.

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  // Preview shares production's GA4 property, so every pull request's
  // Playwright run would otherwise send it real events. VERCEL_ENV is unset
  // locally, so 'production' here means the actual deployment, not
  // NODE_ENV=production on a laptop.
  const gaId = process.env.VERCEL_ENV === 'production' ? process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID : undefined

  return (
    <html lang={lang} className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        {gaId && (
          <>
            <Script
              id="ga4-consent-init"
              strategy="beforeInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer=window.dataLayer||[];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('consent','default',{
                    analytics_storage:'denied',
                    ad_storage:'denied',
                    ad_user_data:'denied',
                    ad_personalization:'denied',
                    wait_for_update:500
                  });
                  gtag('js',new Date());
                  gtag('config','${gaId}');
                `,
              }}
            />
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
          </>
        )}
        <CookieConsentInit locale={lang} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}
```

Keep the file's existing `generateMetadata` function and the `jsonLd` constant exactly as
they are today — only the parts shown above (imports, `generateStaticParams` return value,
and the default export) change. Note `generateStaticParams` now returns `[{lang: 'it'}, {lang: 'en'}, {lang: 'de'}]`
via `locales.map` instead of an empty-array-shaped omission — Cache Components errors on an
empty array, and this one was never empty to begin with, so this is a no-op in practice.

- [x] **Step 2: Remove `instant = false` from this file**

- [x] **Step 3: Delete the old root layout**

- [x] **Step 3b (discovered during execution, not in the original plan): `app/page.tsx`
  needed a root layout too, and turned out to be equally dead.** Once `app/layout.tsx`
  was gone, the build failed with "page.tsx doesn't have a root layout" — not for
  `/manage` (Task 5 handles that) but for the top-level `app/page.tsx`, a
  `redirect('/it')` stub outside both `[lang]` and `/manage`. Checked the same way as
  Task 2's `app/login/*`: `curl -sI http://localhost:3000/` returns `301` →
  `/it` from `proxy.ts` before Next's router ever resolves this file. Deleted it in the
  same commit as this task rather than opening a separate task for it, since it's the
  same class of fix as Task 2 and was required to get this task's build green.

- [x] **Step 4: Build**

```bash
npm run build
```

Expected: fails or succeeds with insights pointing at `app/manage/**` — that's Task 5.
If it fails on something inside `app/[lang]/**` other than `/manage`, re-check Step 1 was
copied correctly before proceeding.

- [x] **Step 5: Commit**

Committed as `98bb79c` (also folds in the `app/page.tsx` deletion from Step 3b).

---

### Task 5: Give `/manage` its own root layout

**Files:**
- Modify: `app/manage/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing other tasks depend on — `/manage` stays out of scope, this only
  restores the `<html>/<body>` it used to inherit from the now-deleted `app/layout.tsx`.

- [x] **Step 1: Add `<html>/<body>` to the admin root layout**

Same font/background treatment as the public site, so nothing about the admin panel's look
changes — no GA, no cookie consent, no JSON-LD (it's not public, `metadata.robots` already
says `noindex`):

```tsx
import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import '../globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Manage · Lelettrica',
  robots: { index: false, follow: false },
}

export default function ManageRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={`${geist.variable} antialiased`}>
      <body className="min-h-screen flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
```

Leave `export const instant = false` on this file — `/manage` is out of scope, it stays
opted out.

- [x] **Step 1b (discovered during execution, not in the original plan): both
  `update-password` pages needed a `<Suspense>` boundary around `useSearchParams()`.**
  Found while getting this task's build green — `app/[lang]/update-password/page.tsx` and
  `app/manage/update-password/page.tsx` are Client Components calling `useSearchParams()`
  at the top level, unwrapped. Cache Components can't build a shell for a route like that
  ("search params are only known at request time"). Previously masked because the whole
  app was dynamic via `app/layout.tsx`'s `headers()` call; with that gone, Next actually
  attempts a shell here and surfaced it. Fixed both with the standard pattern: split into
  an outer component (no hooks) wrapping an inner one (the hooks + all the existing JSX,
  otherwise unchanged) in `<Suspense fallback={null}>`. Unrelated to routes caching, but
  blocking either way — see plan-wide note in Task 4 if this file is read out of order.

- [x] **Step 2: Build and manually check the admin panel still renders correctly**

Verified via `curl -s -L http://localhost:3000/manage` (follows the auth redirect through
to `/it/login`): exactly one `<html lang="it" class="__variable_... antialiased">`, no
double-wrapping. Also verified `/it/routes` renders its real content (one `<h1>`, "Percorsi
consigliati") — a second, misleading "Pagina non trovata" match in the raw response turned
out to be the not-found boundary's *serialized RSC payload* embedded alongside the real
content (normal Next machinery for client-side fallback rendering), not a second rendered
element — confirmed by grepping for actual `<h1>` tags, not just the string.

- [x] **Step 3: Commit**

Committed as `de3c74b` (layout) and `bf997ad` (the Suspense fix, Step 1b).

---

### Task 6: Convert the home page

**Files:**
- Modify: `app/[lang]/page.tsx`

**Interfaces:**
- Produces: nothing other tasks consume.

- [ ] **Step 1: Wrap the flags read in a `"use cache"` function**

Replace the direct `getFlags()` call:

```tsx
import { notFound } from 'next/navigation'
import { cacheLife } from 'next/cache'
import { getDictionary, hasLocale } from './dictionaries'
import { Navbar } from '@/components/navbar'
import { HeroSection } from '@/components/hero-section'
import { RoutesTeaserSection } from '@/components/routes-teaser-section'
import { ServicesSection } from '@/components/services-section'
import { PricingSection } from '@/components/pricing-section'
import { MapSection } from '@/components/map-section'
import { Footer } from '@/components/footer'
import { getFlags } from '@/lib/flags'

async function getHomeFlags() {
  'use cache'
  cacheLife('routesFlags')
  return getFlags()
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const dict = await getDictionary(lang)
  const flags = await getHomeFlags()

  return (
    <>
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} />
      <main>
        <HeroSection lang={lang} dict={dict} />
        {flags.routes && <RoutesTeaserSection lang={lang} dict={dict} />}
        <ServicesSection dict={dict} />
        <PricingSection dict={dict} />
        <MapSection dict={dict} />
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

No `cacheTag` here — `RoutesTeaserSection` shows no route content, just a static link to
`/routes`, so there's nothing for a publish action to invalidate.

- [ ] **Step 2: Remove `instant = false` from this file**

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: succeeds, and the build output's route table should no longer mark `/[lang]`
fully dynamic (read the legend it prints — Cache Components adds a partial-prerender
indicator distinct from the old `○`/`ƒ` pair; if it's unclear from the table alone, `curl -sI`
a built-and-started server twice in a row and look for the response headers Next adds for a
cache hit vs a miss).

- [ ] **Step 4: Commit**

```bash
git add app/[lang]/page.tsx
git commit -m "Cache the home page's flag check"
```

---

### Task 7: Convert the routes list page

**Files:**
- Create: `lib/routes-data.ts`
- Modify: `app/[lang]/routes/page.tsx`

**Interfaces:**
- Produces: `getRoutesListData(lang: 'it' | 'en' | 'de'): Promise<{ flags: Flags, routes: { route: typeof routes.$inferSelect, translation: typeof routeTranslations.$inferSelect }[] }>` — consumed here and, for its `cacheTag`, by Task 9.

- [ ] **Step 1: Write the cached data function**

```ts
// lib/routes-data.ts
import { eq, and } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'
import { db, routes, routeTranslations } from '@/lib/db'
import { getFlags } from '@/lib/flags'

type Locale = 'it' | 'en' | 'de'

export async function getRoutesListData(lang: Locale) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag('routes-list')

  const flags = await getFlags()
  if (!flags.routes) return { flags, routes: [] }

  const publishedRoutes = await db
    .select()
    .from(routes)
    .where(eq(routes.isPublished, true))

  const routesWithTranslations = (
    await Promise.all(
      publishedRoutes.map(async (route) => {
        const [translation] = await db
          .select()
          .from(routeTranslations)
          .where(and(
            eq(routeTranslations.routeId, route.id),
            eq(routeTranslations.locale, lang)
          ))
        if (!translation) return null
        return { route, translation }
      })
    )
  ).filter((i): i is NonNullable<typeof i> => i !== null)

  return { flags, routes: routesWithTranslations }
}
```

This deliberately checks `flags.routes` *inside* the cached function, before the DB query —
same short-circuit the page had before, now also skipping the query on a cache hit while
the section is off.

- [ ] **Step 2: Use it from the page, keeping the per-card media `Suspense` exactly as is**

```tsx
import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getDictionary, hasLocale } from '../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { RouteFilters } from '@/components/route-filters'
import { RouteCardMediaAsync } from '@/components/route-card-media-async'
import { SectionViewTracker } from '@/components/section-view-tracker'
import { Skeleton } from '@/components/ui/skeleton'
import { shortRouteId } from '@/lib/utils'
import { getRoutesListData } from '@/lib/routes-data'

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params
  if (!hasLocale(lang)) return {}
  const { flags } = await getRoutesListData(lang)
  if (!flags.routes) return {}
  const dict = await getDictionary(lang)
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  return {
    title: dict.routes.page_title,
    description: dict.routes.page_subtitle,
    alternates: {
      canonical: `${siteUrl}/${lang}/routes`,
      languages: {
        it: `${siteUrl}/it/routes`,
        en: `${siteUrl}/en/routes`,
        de: `${siteUrl}/de/routes`,
        'x-default': `${siteUrl}/it/routes`,
      },
    },
  }
}

export default async function RoutesPage({
  params,
}: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  if (!hasLocale(lang)) notFound()

  const { flags, routes: routesWithTranslations } = await getRoutesListData(lang)
  if (!flags.routes) notFound()

  const dict = await getDictionary(lang)

  // Only the fast, cached DB-backed bits (text, stats, filters) come from
  // getRoutesListData. Each card's media — cover photo/video and GPX map
  // preview — depends on R2 lookups that can be slow or unreachable, so it
  // stays in its own Suspense boundary, outside the cache, exactly as before.
  const routesWithData = routesWithTranslations.map(({ route, translation }) => ({
    route,
    translation,
    media: (
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-none" />}>
        <RouteCardMediaAsync route={route} routeName={translation.name} />
      </Suspense>
    ),
  }))

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.routes.page_title,
    url: `${siteUrl}/${lang}/routes`,
    numberOfItems: routesWithData.length,
    itemListElement: routesWithData.map(({ route, translation: t }, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${siteUrl}/${lang}/routes/${shortRouteId(route.id)}`,
      name: t?.name ?? shortRouteId(route.id),
    })),
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar lang={lang} dict={dict} showRoutes={flags.routes} />
      <main className="w-full pt-24 pb-16">
        <div className="max-w-6xl mx-auto px-12 sm:px-20 space-y-8">
          <div>
            <SectionViewTracker name="routes_list" />
            <h1 className="text-3xl font-bold text-[#1e3a5f]">{dict.routes.page_title}</h1>
            <p className="text-muted-foreground mt-2 max-w-xl">{dict.routes.page_subtitle}</p>
          </div>
          <RouteFilters routes={routesWithData} lang={lang} dict={dict} />
        </div>
      </main>
      <Footer lang={lang} dict={dict} />
    </>
  )
}
```

Note `getFlags` is no longer imported directly here — only via `getRoutesListData`.

- [ ] **Step 3: Remove `instant = false` from this file**

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add lib/routes-data.ts app/[lang]/routes/page.tsx
git commit -m "Cache the routes list's DB query and flag check together"
```

---

### Task 8: Convert the route detail page

**Files:**
- Modify: `lib/routes-data.ts`
- Modify: `app/[lang]/routes/[id]/page.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks.
- Produces: `getRouteDetailData(lang: Locale, id: string): Promise<{ flags: Flags, route: typeof routes.$inferSelect | null, translation?, allMedia?, gpxPoints? }>` — its `cacheTag` is consumed by Task 9.

This page's original comment warned that adding `generateStaticParams` here caused a real
production incident (2026-09-11: a build with an exhausted DB pool got no params back,
Next treated the route as ISR, and `headers()` threw — 500 on every route detail page).
That was a symptom of the exact problem Task 4 fixes: `headers()` is gone from the tree
now. Even so, **this plan does not add `generateStaticParams` for route ids** — the
detail page keeps rendering per request, same as today, and the win here is purely that
its DB/R2 fetch is now cached and tag-invalidated, not that the page gets a prerendered
shell. Keep `params` awaited at the top of the component, unchanged from today.

- [ ] **Step 1: Extend `lib/routes-data.ts` with the detail function**

```ts
// add to lib/routes-data.ts
import { sql } from 'drizzle-orm'
import { routePhotos } from '@/lib/db'
import { resolveHlsUrl } from '@/lib/media'
import { loadGpxPoints } from '@/lib/route-gpx'

export async function getRouteDetailData(lang: Locale, id: string) {
  'use cache'
  cacheLife('routesFlags')
  cacheTag(`route-${id}`)

  const flags = await getFlags()
  if (!flags.routes) return { flags, route: null } as const

  const [route] = await db.select().from(routes).where(
    and(sql`left(${routes.id}::text, 8) = ${id}`, eq(routes.isPublished, true))
  )
  if (!route) return { flags, route: null } as const

  const [translation] = await db.select().from(routeTranslations).where(
    and(eq(routeTranslations.routeId, route.id), eq(routeTranslations.locale, lang))
  )

  const rawMedia = await db.select().from(routePhotos)
    .where(eq(routePhotos.routeId, route.id))
    .orderBy(routePhotos.displayOrder)

  // Drop what the flags disallow before the HLS check, so switching videos
  // off also skips the R2 round-trips they would have cost.
  const permittedMedia = rawMedia.filter((m) =>
    m.mediaType === 'video' ? flags.routeVideos : flags.routePhotos
  )

  // resolveHlsUrl and loadGpxPoints already have their own durable,
  // near-permanent Upstash cache (lib/cache.ts) — this "use cache" wrapper
  // is a thin, short-lived layer on top, not a replacement for it.
  const allMedia = (await Promise.all(
    permittedMedia.map(async (m) => {
      if (m.mediaType !== 'video') return m
      const hlsUrl = await resolveHlsUrl(m.storageKey)
      return hlsUrl ? { ...m, hlsUrl } : null
    })
  )).filter((m): m is NonNullable<typeof m> => m !== null)

  const gpxPoints =
    flags.routeFlyover && route.gpxKey
      ? await loadGpxPoints(route.gpxKey, route.updatedAt)
      : []

  return { flags, route, translation, allMedia, gpxPoints } as const
}
```

- [ ] **Step 2: Rewrite the page to consume it**

Replace the top of `app/[lang]/routes/[id]/page.tsx` — delete the old comment about
`headers()` (the reason no longer applies, see the note above this task), delete the
now-unused imports (`db, routes, routeTranslations, routePhotos`, `resolveHlsUrl`,
`loadGpxPoints`, `getFlags`), and replace `generateMetadata`'s and the page's data-fetching
with calls to `getRouteDetailData`. Everything from `return (` onward in the page component
is **unchanged** — it already just consumes `route`, `translation`, `allMedia`,
`gpxPoints`, `flags` as local variables.

```tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft, Ruler, TrendingUp, Clock } from 'lucide-react'
import { getDictionary, hasLocale } from '../../dictionaries'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import { Badge } from '@/components/ui/badge'
import { RouteGallery } from '@/components/route-gallery'
import { BikeTypeIcon, bikeTypeBadgeClass } from '@/components/bike-type-icon'
import { DifficultyBadge } from '@/components/difficulty-badge'
import { RouteFlyoverLoader } from '@/components/route-flyover-loader'
import { RouteGpxModal } from '@/components/route-gpx-modal'
import { RouteShareModal } from '@/components/route-share-modal'
import { RouteExternalLinks } from '@/components/route-external-links'
import { RouteViewTracker } from '@/components/route-view-tracker'
import { r2PublicUrl } from '@/lib/r2'
import { getRouteDetailData } from '@/lib/routes-data'

export async function generateMetadata({
  params,
}: { params: Promise<{ lang: string; id: string }> }): Promise<Metadata> {
  const { lang, id } = await params
  if (!hasLocale(lang)) return {}

  const data = await getRouteDetailData(lang, id)
  if (!data.flags.routes || !data.route) return {}
  const { route, translation, allMedia } = data

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const title = translation?.name ?? id
  const description = translation?.description?.slice(0, 155) ?? ''
  const coverPhoto = allMedia?.find((m) => m.mediaType === 'photo')
  const ogImage = coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : `${siteUrl}/opengraph-image`

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: ogImage }], url: `${siteUrl}/${lang}/routes/${id}` },
    alternates: {
      canonical: `${siteUrl}/${lang}/routes/${id}`,
      languages: {
        it: `${siteUrl}/it/routes/${id}`,
        en: `${siteUrl}/en/routes/${id}`,
        de: `${siteUrl}/de/routes/${id}`,
        'x-default': `${siteUrl}/it/routes/${id}`,
      },
    },
  }
}

export default async function RouteDetailPage({
  params,
}: { params: Promise<{ lang: string; id: string }> }) {
  const { lang, id } = await params
  if (!hasLocale(lang)) notFound()

  const { flags, route, translation, allMedia, gpxPoints } = await getRouteDetailData(lang, id)
  if (!flags.routes || !route) notFound()

  const dict = await getDictionary(lang)
  const d = dict.routes

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lelettricaleoni.com').replace(/\/$/, '')
  const coverPhoto = allMedia?.find((m) => m.mediaType === 'photo')

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ExercisePlan',
    name: translation?.name ?? id,
    description: translation?.description,
    url: `${siteUrl}/${lang}/routes/${id}`,
    image: coverPhoto ? r2PublicUrl(coverPhoto.storageKey) : undefined,
    exerciseType: 'Cycling',
    associatedAnatomy: route.bikeTypes,
    provider: { '@type': 'LocalBusiness', name: 'Lelettrica di Leoni Gabriele', url: siteUrl },
  }

  return (
    <>
      {/* Keep today's app/[lang]/routes/[id]/page.tsx lines 136-242 verbatim —
          copy them, don't retype by hand. That JSX only reads route,
          translation, allMedia, gpxPoints, flags, dict, d, lang, id, siteUrl,
          coverPhoto, jsonLd, all of which still exist above with the same
          names and shapes they had before this task. */}
    </>
  )
}
```

- [ ] **Step 3: Remove `instant = false` from this file**

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: succeeds. If Cache Components reports a **hard error** (not merely an insight)
about `params` being read outside `<Suspense>` on this route, that means the "no static
shell without `generateStaticParams`" assumption above was wrong for this Next version —
in that case, wrap the body in a Suspense boundary instead of changing the plan's intent:

```tsx
import { Suspense } from 'react'

export default function RouteDetailPage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  return (
    <Suspense fallback={null}>
      <RouteDetailContent params={params} />
    </Suspense>
  )
}

async function RouteDetailContent({ params }: { params: Promise<{ lang: string; id: string }> }) {
  // ...the entire body written in Step 2, unchanged, moved into this function...
}
```

(`fallback={null}` because the route segment's existing `loading.tsx` already provides a
skeleton at the route level — check `app/[lang]/routes/[id]/loading.tsx` exists before
picking this fallback; if it doesn't, use the same `<Skeleton>` pattern the list page uses
instead of `null`.)

- [ ] **Step 5: Commit**

```bash
git add lib/routes-data.ts app/[lang]/routes/[id]/page.tsx
git commit -m "Cache the route detail page's DB, flag and media-resolution work"
```

---

### Task 9: Wire `updateTag` into the admin publish actions

**Files:**
- Modify: `lib/actions/routes.ts`

**Interfaces:**
- Consumes: the `'routes-list'` and `` `route-${id}` `` tags produced in Tasks 7 and 8.

- [ ] **Step 1: Swap the import**

```ts
// remove:
import { revalidatePath } from 'next/cache'
// add:
import { updateTag } from 'next/cache'
```

- [ ] **Step 2: Replace each `revalidatePath` call**

`createRouteAction` (was line 134, right before `redirect('/manage/routes')`):

```ts
updateTag('routes-list')
updateTag(`route-${shortRouteId(newRoute.id)}`)
redirect('/manage/routes')
```

`updateRouteAction` (was lines 233-234):

```ts
updateTag('routes-list')
updateTag(`route-${shortRouteId(id)}`)
redirect('/manage/routes')
```

`deleteRouteAction` (was line 254, end of function):

```ts
updateTag('routes-list')
```

`togglePublishAction` (was lines 265-266, end of function):

```ts
updateTag('routes-list')
if (route) updateTag(`route-${shortRouteId(route.id)}`)
```

`savePhotosAction` (was line 308, end of function):

```ts
if (route) updateTag(`route-${shortRouteId(route.id)}`)
```

- [ ] **Step 3: Confirm `shortRouteId` is already imported**

It is (`import { shortRouteId } from '@/lib/utils'` at the top of the file) — no import
change needed for this step.

- [ ] **Step 4: Build and typecheck**

```bash
npm run build
npm run typecheck
```

Expected: both succeed. `updateTag` only works inside a Server Action — every function in
this file already starts with `'use server'` at the top of the file, so this doesn't
introduce a new error class.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/routes.ts
git commit -m "Invalidate the routes cache on publish instead of a dead revalidatePath"
```

---

### Task 10: Full verification and measurement

**Files:** none (verification only)

- [ ] **Step 1: Full local check**

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all succeed.

- [ ] **Step 2: Confirm the codemod's opt-outs are still only where intended**

```bash
grep -rl "export const instant = false" app
```

Expected: only files under `app/manage/`, `app/[lang]/login/`, `app/[lang]/update-password/`,
`app/[lang]/privacy/`, and `app/global-not-found.tsx`'s siblings that were never touched.
Nothing under `app/[lang]/page.tsx`, `app/[lang]/routes/page.tsx`,
`app/[lang]/routes/[id]/page.tsx`, or `app/[lang]/layout.tsx`.

- [ ] **Step 3: Push and open a PR against `main`**

```bash
git push -u origin feat/routes-caching-cache-components
gh pr create --title "Cache the public site's routes pages with Cache Components" --body "$(cat <<'EOF'
## Summary
- Moves the locale off the `x-locale` header and onto the `[lang]` URL segment, so the
  public site's root layout no longer forces the whole tree to render on demand.
- Enables Next 16 Cache Components; caches each public page's DB query + feature-flag
  check together with a ~30s cacheLife, tagged so the admin's publish/edit/delete/toggle
  actions can invalidate immediately via `updateTag` instead of waiting on the TTL.
- `/manage`, `/login`, `/update-password`, `/privacy` are untouched — opted out of the new
  validation, exactly as dynamic as before.
- Drops three dead files under `app/login/` (unreachable — `proxy.ts` redirects `/login`
  to `/{locale}/login` before Next's router ever resolves them).

## Test plan
- [ ] `npm run build` shows the converted routes are no longer fully dynamic
- [ ] Response time of `/it/routes` and `/it` measured before/after on the preview deploy
- [ ] Publishing/editing a route in `/manage` shows up on the public site on the next
      request, not after a wait
- [ ] Toggling the `routes` feature flag off still reaches `/it/routes` within roughly the
      same ~30s window as on `main`
- [ ] `/manage`, `/login`, `/it/privacy` render unchanged
EOF
)"
```

- [ ] **Step 4: Measure against the PR's preview deploy, not locally**

Once the PR's preview deploy is up, compare against the same measurement taken against
`main`'s production or its own preview — not against `localhost`, which never went through
Vercel's build/serve path and won't show cache-hit behavior. For each of `/it`, `/it/routes`,
and one `/it/routes/<id>`: request it once (cache miss), then again (cache hit), and record
both. If the second request isn't meaningfully faster than `main`, or the first is slower,
stop and investigate before merging — this is the exact kind of change the project's
"measure before declaring done" rule exists for.

- [ ] **Step 5: Manually verify the invalidation and kill-switch behavior**

Against the preview: publish or edit a route from `/manage`, then load its public page —
confirm the change is visible immediately. Toggle the `routes` Vercel Flag off, then reload
`/it/routes` — confirm it 404s (streamed 200 with not-found content, per the project's own
rule about status codes) within about the same delay as on `main` today.
