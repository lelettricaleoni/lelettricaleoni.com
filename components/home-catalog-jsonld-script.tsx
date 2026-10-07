import { getBikeCoverPhotoKeys, getBikeModelsListData } from '@/lib/bikes-data'
import { buildHomeCatalogJsonLd } from '@/lib/home-catalog-jsonld'

/** The longest the home page waits on the database for its structured data. */
const CATALOG_TIMEOUT_MS = 2000

/**
 * The catalogue for the home page's structured data.
 *
 * The home page never touched the database before this, and it is the page
 * with the most traffic. So the read sits outside its critical path on
 * purpose: render this inside a Suspense boundary (the page streams without
 * waiting) and give up after CATALOG_TIMEOUT_MS or on any error. A slow or
 * stuck database costs the home page its catalogue markup, nothing else — the
 * pooler has hung requests for minutes before (STATE.md).
 */
export async function HomeCatalogJsonLd({
  lang,
  siteUrl,
  name,
}: {
  lang: 'it' | 'en' | 'de'
  siteUrl: string
  name: string
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let catalog: { models: Awaited<ReturnType<typeof getBikeModelsListData>>; covers: Record<string, string> } | null
  try {
    // Both reads share one deadline: the photos wait on R2 and Redis, which can
    // stall just like the database.
    catalog = await Promise.race([
      Promise.all([getBikeModelsListData(lang), getBikeCoverPhotoKeys()]).then(([models, covers]) => ({
        models,
        covers,
      })),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CATALOG_TIMEOUT_MS)
      }),
    ])
  } catch {
    catalog = null
  } finally {
    clearTimeout(timer)
  }
  if (!catalog) return null

  const jsonLd = buildHomeCatalogJsonLd({ siteUrl, lang, name, ...catalog })
  if (!jsonLd) return null

  return (
    <script
      type="application/ld+json"
      // Bike names come from the database: escaping "<" keeps a "</script>" in
      // one of them from ending the tag early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  )
}
