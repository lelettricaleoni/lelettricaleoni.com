import type { BikeCategory } from '@/lib/db'
import { priceForDay } from '@/lib/bike-pricing'
import { shortId } from '@/lib/utils'
import { photoShareUrl } from '@/lib/media-client'

interface CatalogModel {
  model: { id: string; priceAdjustmentPercent: string }
  translation: { name: string }
  category: BikeCategory
}

/**
 * The shop's rental catalogue for the home page, built from the same rows the
 * bikes list shows — a hand-written copy in the layout named models that could
 * stop being the real ones, and typed bikes as `RentalCar`.
 *
 * Emitted as a second fragment of the same entity (same `@id` as the business
 * in the layout) so a search engine merges the two. `LeaseOut` marks the offers
 * as rentals: these bikes are hired by the day, never sold.
 *
 * The catalogue lists `Product`s that carry their own `offers`, not `Offer`s
 * wrapping an `itemOffered` product: Google's product-snippet check reads every
 * `Product` it finds on its own and rejects one with no `offers`, `review` or
 * `aggregateRating` — seven "invalid items" in Search Console (2026-10-02).
 *
 * A model whose category has no day-1 price is left out rather than priced at
 * zero: no price is better than a made-up one. A model with no ready photo is
 * left out too: Google rejects a product with no `image` (seven more "invalid
 * items" once the offers were fixed, 2026-10-05), so listing it would only
 * bring the error back. The link-preview JPEG is used, as on the bike page:
 * crawlers read it where they would not read an AVIF.
 */
export function buildHomeCatalogJsonLd({
  siteUrl,
  lang,
  name,
  models,
  covers,
}: {
  siteUrl: string
  lang: string
  name: string
  models: CatalogModel[]
  /** model id → storage key of its first ready photo. */
  covers: Record<string, string>
}) {
  const products = models.flatMap(({ model, translation, category }) => {
    const price = priceForDay(category, 1, Number(model.priceAdjustmentPercent))
    const cover = covers[model.id]
    if (price === null || !cover) return []
    const url = `${siteUrl}/${lang}/bikes/${shortId(model.id)}`
    return [
      {
        '@type': 'Product',
        name: translation.name,
        category: category.name,
        url,
        image: photoShareUrl(cover),
        offers: {
          '@type': 'Offer',
          url,
          price,
          priceCurrency: 'EUR',
          businessFunction: 'https://purl.org/goodrelations/v1#LeaseOut',
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price,
            priceCurrency: 'EUR',
            referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'DAY' },
          },
        },
      },
    ]
  })

  if (products.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'BikeShop'],
    '@id': `${siteUrl}/#business`,
    hasOfferCatalog: { '@type': 'OfferCatalog', name, itemListElement: products },
  }
}
