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

/** The flags for this request. Server-side only. */
export async function getFlags(): Promise<Flags> {
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

  const flags = Object.fromEntries(resolved) as Flags
  const overrides =
    process.env.NODE_ENV === 'production'
      ? {}
      : readDevOverrides(process.env as Record<string, string | undefined>)

  return applyCascade({ ...flags, ...overrides })
}
