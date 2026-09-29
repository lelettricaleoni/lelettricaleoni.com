import type { BikeCategory } from '@/lib/db'
import { priceForDay } from '@/lib/bike-pricing'
import { shortId } from '@/lib/utils'

interface CatalogModel {
  model: { id: string }
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
 * A model whose category has no day-1 price is left out rather than priced at
 * zero: no price is better than a made-up one.
 */
export function buildHomeCatalogJsonLd({
  siteUrl,
  lang,
  name,
  models,
}: {
  siteUrl: string
  lang: string
  name: string
  models: CatalogModel[]
}) {
  const offers = models.flatMap(({ model, translation, category }) => {
    const price = priceForDay(category, 1)
    if (price === null) return []
    const url = `${siteUrl}/${lang}/bikes/${shortId(model.id)}`
    return [
      {
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
        itemOffered: { '@type': 'Product', name: translation.name, category: category.name, url },
      },
    ]
  })

  if (offers.length === 0) return null

  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'BikeShop'],
    '@id': `${siteUrl}/#business`,
    hasOfferCatalog: { '@type': 'OfferCatalog', name, itemListElement: offers },
  }
}
