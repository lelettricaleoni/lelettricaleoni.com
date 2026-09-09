/**
 * Feature flags.
 *
 * A feature flag is a switch that turns part of the site off without deleting
 * the code, so a section can be taken down in a minute — a service is
 * misbehaving, content is not ready, a page must disappear before an event —
 * and put back just as fast.
 *
 * Values come from **Vercel Flags**: they are set in the project's Flags
 * dashboard and take effect without a redeploy. Authentication uses the
 * project's OIDC token, so there is no key to manage. Vercel bundles a snapshot
 * of the flag definitions into each deployment, which is what gets used if the
 * flags service is briefly unreachable.
 *
 * Reading a flag is fine on any page here: every route already renders on
 * demand, because the root layout reads the `x-locale` header. No precomputed
 * variants are needed.
 *
 * Two behaviours are ours, not the platform's, and are kept here on purpose:
 *
 * - **Everything defaults to on.** A missing flag, an unreachable service or an
 *   unrecognised override all mean "the site works as built". Nothing about a
 *   failure should be able to take a section down.
 * - **A section cannot be half off.** Switching `routes` off switches off
 *   everything inside it, so there is no state where the photos of a hidden
 *   section are still being served.
 *
 * A note on what "off" means for a page. The routes pages have a loading.tsx,
 * so Next streams them, and once the body is streaming the status code can no
 * longer change: `notFound()` renders the not-found UI but the response stays
 * 200. Next covers the SEO side by injecting `<meta name="robots"
 * content="noindex">`. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md,
 * section "Status Codes".
 *
 * `app/sitemap.ts` used to be prerendered; awaiting the flags moved it to
 * on-demand rendering, so a switched-off section leaves the sitemap
 * immediately rather than at the next build. Sitemaps are fetched rarely and
 * the query behind it is cheap, so the trade is worth it.
 */

import { flag } from 'flags/next'
import { vercelAdapter } from '@flags-sdk/vercel'

export const FLAG_DEFAULTS = {
  /** The whole routes section: pages, navbar link, sitemap entries. */
  routes: true,
  /** Photo galleries on route cards and detail pages. */
  routePhotos: true,
  /** Video playback on route detail pages. */
  routeVideos: true,
  /** The Cesium 3D flyover on route detail pages. */
  routeFlyover: true,
  /** The GPX download button and the endpoint that serves the file. */
  routeGpxDownload: true,
} as const

export type FlagName = keyof typeof FLAG_DEFAULTS
export type Flags = Record<FlagName, boolean>

/** Everything that lives inside the routes section and dies with it. */
const CHILDREN_OF_ROUTES: FlagName[] = [
  'routePhotos',
  'routeVideos',
  'routeFlyover',
  'routeGpxDownload',
]

/**
 * The flag declarations. `key` is the name to create in the Vercel Flags
 * dashboard; `defaultValue` is what applies when no value comes back.
 */
const definitions = {
  routes: flag<boolean>({
    key: 'routes',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The whole routes section: pages, navbar link, sitemap entries.',
  }),
  routePhotos: flag<boolean>({
    key: 'route-photos',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'Photo galleries on route cards and detail pages.',
  }),
  routeVideos: flag<boolean>({
    key: 'route-videos',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'Video playback on route detail pages.',
  }),
  routeFlyover: flag<boolean>({
    key: 'route-flyover',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The Cesium 3D flyover on route detail pages.',
  }),
  routeGpxDownload: flag<boolean>({
    key: 'route-gpx-download',
    adapter: vercelAdapter(),
    defaultValue: true,
    description: 'The GPX download button and the endpoint that serves the file.',
  }),
} satisfies Record<FlagName, unknown>

/**
 * Enforce that a switched-off section takes its contents with it.
 * Pure, and does not mutate its argument.
 */
export function applyCascade(flags: Flags): Flags {
  const out = { ...flags }
  if (!out.routes) {
    for (const child of CHILDREN_OF_ROUTES) out[child] = false
  }
  return out
}

const OFF_VALUES = new Set(['off', '0', 'false', 'no'])
const ON_VALUES = new Set(['on', '1', 'true', 'yes'])

const ENV_NAMES: Record<FlagName, string> = {
  routes: 'FEATURE_ROUTES',
  routePhotos: 'FEATURE_ROUTE_PHOTOS',
  routeVideos: 'FEATURE_ROUTE_VIDEOS',
  routeFlyover: 'FEATURE_ROUTE_FLYOVER',
  routeGpxDownload: 'FEATURE_ROUTE_GPX_DOWNLOAD',
}

/**
 * Local development overrides, read from environment variables.
 *
 * The dashboard is the source of truth, but evaluating a flag needs an OIDC
 * token, which a machine without `vercel link` does not have — and the tests
 * must be able to exercise a switched-off section with no network at all.
 * These overrides fill that gap and are ignored in production.
 *
 * An unrecognised value overrides nothing, so a typo cannot hide a section.
 */
export function readDevOverrides(env: Record<string, string | undefined>): Partial<Flags> {
  const overrides: Partial<Flags> = {}
  for (const name of Object.keys(FLAG_DEFAULTS) as FlagName[]) {
    const raw = env[ENV_NAMES[name]]?.trim().toLowerCase()
    if (raw === undefined) continue
    if (OFF_VALUES.has(raw)) overrides[name] = false
    else if (ON_VALUES.has(raw)) overrides[name] = true
  }
  return overrides
}

/**
 * How long an evaluation is reused before asking the flags service again.
 *
 * Every evaluation is a network round-trip, and a page calls getFlags more
 * than once — generateMetadata, the page body, the navbar prop. Measured
 * without this cache, five evaluations per call turned a 0.15 s home page into
 * 6.2 s. The cost of the cache is that switching a flag takes up to this long
 * to reach visitors, which is still "immediately" for a kill switch and far
 * better than the redeploy it replaced.
 */
const CACHE_TTL_MS = 30_000

/**
 * How long the very first call — the one with nothing cached yet — waits for
 * the flags service before falling back to the defaults. The refresh keeps
 * running and fills the cache for the next request.
 *
 * Measured evaluation cost against the live service is around 6 s, which is
 * absurd for a flag lookup and is probably down to the flags not existing in
 * the dashboard yet. Whatever the reason, no visitor should ever wait on it.
 */
const COLD_TIMEOUT_MS = 1_500

let cache: { flags: Flags; at: number } | null = null
/** Refresh in progress, shared so concurrent requests don't stampede. */
let refreshing: Promise<Flags> | null = null

/** Ask the flags service for every flag, in parallel, once. */
async function evaluateAll(): Promise<Flags> {
  const names = Object.keys(FLAG_DEFAULTS) as FlagName[]
  const resolved = await Promise.all(
    names.map(async (name) => {
      try {
        return [name, await definitions[name]()] as const
      } catch (err) {
        // An unreachable flags service must never take a section down, but
        // failing silently would hide a misconfigured flag for months
        console.error(`[flags] could not evaluate "${name}", defaulting to on:`, err)
        return [name, true] as const
      }
    })
  )
  return Object.fromEntries(resolved) as Flags
}

/** Drop the cached evaluation. Exists for tests. */
export function clearFlagsCache(): void {
  cache = null
  refreshing = null
}

/** Refresh the cache, sharing one evaluation across concurrent callers. */
function refresh(): Promise<Flags> {
  if (refreshing) return refreshing
  refreshing = evaluateAll()
    .then((flags) => {
      cache = { flags, at: Date.now() }
      return flags
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

const ALL_ON = (): Flags =>
  Object.fromEntries((Object.keys(FLAG_DEFAULTS) as FlagName[]).map((n) => [n, true])) as Flags

/**
 * The flags for this request. Server-side only.
 *
 * A request never waits on the flags service beyond the cold-start timeout:
 * a stale value is served while a refresh runs in the background. Waiting
 * would put the service's latency on the critical path of every page, which
 * is how this ended up making the home page 40x slower once already.
 */
export async function getFlags(): Promise<Flags> {
  // Overrides are read every time: they cost nothing and stay instant in dev
  const overrides =
    process.env.NODE_ENV === 'production'
      ? {}
      : readDevOverrides(process.env as Record<string, string | undefined>)

  if (cache) {
    // Stale: serve what we have and refresh behind the request
    if (Date.now() - cache.at > CACHE_TTL_MS && !refreshing) void refresh()
    return applyCascade({ ...cache.flags, ...overrides })
  }

  // Nothing cached, but someone is already fetching: don't queue up behind
  // them. Only the caller that started the refresh ever waits.
  if (refreshing) return applyCascade({ ...ALL_ON(), ...overrides })

  // First caller: wait, but only briefly, then fall back to on
  const flags = await Promise.race([
    refresh(),
    new Promise<Flags>((resolve) => setTimeout(() => resolve(ALL_ON()), COLD_TIMEOUT_MS)),
  ])
  return applyCascade({ ...flags, ...overrides })
}
