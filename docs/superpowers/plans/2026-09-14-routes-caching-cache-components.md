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

**Actual outcome — diverges from what this task originally planned.** The plan below
assumed `getFlags()` could move into a `"use cache"` function, matching the design spec.
It can't: `@flags-sdk/vercel` reads `headers()` internally (Vercel Toolbar override
support), and Cache Components forbids any `headers()`/`cookies()` access inside a `"use
cache"` scope — even indirect, even when the calling code never touches it directly.
Discovered as a real build failure while executing this task, not anticipated at design
time: `Route /[lang] used 'headers()' inside "use cache". Accessing Dynamic data sources
inside a cache scope is not supported.`

Since the home page's *only* data dependency is the flag check, there is nothing left
here for Cache Components to cache. Reverted to the original direct `getFlags()` call,
restored `export const instant = false`, added a comment explaining why. The page stays
exactly as dynamic as it is on `main` — no regression, just no win here either. Committed
as `39cc186` together with Tasks 7-8.

---

### Task 7: Convert the routes list page

**Files:**
- Create: `lib/routes-data.ts`
- Modify: `app/[lang]/routes/page.tsx`

**Actual outcome — same root cause as Task 6, different result.** `getFlags()` stays
*outside* `getRoutesListData(lang)`, called dynamically by the page and
`generateMetadata` exactly as before. `getRoutesListData` wraps only the DB query
(published routes + translations) in `"use cache"`, with `cacheLife('routesFlags')` and
`cacheTag('routes-list')` — unchanged from the original design on that front. The page
itself keeps `export const instant = false`: it's still request-bound from Cache
Components' point of view (the `getFlags()` call sees to that), but the expensive part —
the DB round-trip — is now genuinely cached and reused across requests regardless.

Verified at runtime, not just via a green build (`npm run start`, then `curl -w
"%{time_total}"` against `/it/routes` three times in a row): **0.98s → 0.11s → 0.10s**.
The per-card media `<Suspense>` boundary (R2 lookups) is untouched, exactly as planned.

Committed as `39cc186` together with Tasks 6 and 8.

---

### Task 8: Convert the route detail page

**Files:**
- Modify: `lib/routes-data.ts`
- Modify: `app/[lang]/routes/[id]/page.tsx`

**Actual outcome — same correction as Tasks 6-7, plus one more consequence of it.**
`getRouteDetailData(lang, id, mediaFlags)` takes the three flag booleans it actually needs
(`routeVideos`, `routePhotos`, `routeFlyover`) as an explicit third argument instead of
calling `getFlags()` itself — the pattern Next's own error message recommends ("read
[runtime data] outside the cached function and pass the required dynamic data in as an
argument"). Different flag combinations get their own cache entry, same as different
`(lang, id)` pairs do. `resolveHlsUrl` and `loadGpxPoints` stay inside the cached
function, as originally planned — they have their own durable Upstash cache underneath,
this is just a thin, short-lived layer on top.

The page keeps `export const instant = false` and **no `generateStaticParams`**, as the
original plan already decided (route ids aren't enumerated at build time, on purpose —
see the 2026-09-11 incident in `STATE.md`). The question the plan flagged — whether Cache
Components would hard-error on `params` awaited outside `<Suspense>` for an unenumerated
dynamic segment — turned out not to arise: the build succeeded without needing the
Suspense-wrapped fallback the plan prepared for. Didn't need it, didn't add it.

Verified at runtime: a route detail page's response time went **0.26s → 0.04s** on the
second request.

Committed as `39cc186` together with Tasks 6-7.


### Task 9: Wire `updateTag` into the admin publish actions

**Files:**
- Modify: `lib/actions/routes.ts`

**Interfaces:**
- Consumes: the `'routes-list'` and `` `route-${id}` `` tags produced in Tasks 7 and 8.

- [x] **Step 1: Swap the import**

```ts
// remove:
import { revalidatePath } from 'next/cache'
// add:
import { updateTag } from 'next/cache'
```

- [x] **Step 2: Replace each `revalidatePath` call**

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

- [x] **Step 3: Confirm `shortRouteId` is already imported**

It was.

- [x] **Step 4: Build and typecheck**

Both succeeded. Lint also clean (same 10 pre-existing warnings as before this task, 0
errors). End-to-end verification of the invalidation itself (publish a route from
`/manage`, confirm it's immediately visible publicly) needs a real admin session —
deferred to Task 10's manual check against the preview deploy, as the plan already
scoped it there.

- [x] **Step 5: Commit**

Committed as `96d3948`.

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
