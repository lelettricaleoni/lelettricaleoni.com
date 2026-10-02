import { describe, it, expect } from 'vitest'
import { buildHomeCatalogJsonLd } from './home-catalog-jsonld'
import type { BikeCategory } from './db'

function category(overrides: Partial<BikeCategory> = {}): BikeCategory {
  return {
    id: 'cat-1',
    name: 'Gravel',
    displayOrder: 0,
    routeCategoryId: null,
    maxRentalDays: 5,
    pricingMode: 'table',
    day1Price: '25',
    day2Price: '47',
    day3Price: null,
    day4Price: null,
    day5Price: null,
    day6Price: null,
    day7Price: null,
    perDayAfterPrice: null,
    afternoonPrice: null,
    ...overrides,
  }
}

const base = { siteUrl: 'https://www.example.test', lang: 'it', name: 'Le nostre bici' }
const gravel = { model: { id: 'aa7da601-1111-2222-3333-444455556666' }, translation: { name: 'Mondraker Arid S' }, category: category() }
const classic = {
  model: { id: 'bb7da601-1111-2222-3333-444455556666' },
  translation: { name: 'City classica' },
  category: category({ name: 'City Bike Classica', pricingMode: 'linear', day1Price: '15', perDayAfterPrice: '10' }),
}

describe('buildHomeCatalogJsonLd', () => {
  it('links each offer to its bike page, in the page language, at the day-1 price', () => {
    const ld = buildHomeCatalogJsonLd({ ...base, models: [gravel, classic] })!
    const [first, second] = ld.hasOfferCatalog.itemListElement

    expect(first).toMatchObject({ '@type': 'Product', name: 'Mondraker Arid S', category: 'Gravel' })
    expect(first.offers.url).toBe('https://www.example.test/it/bikes/aa7da601')
    expect(first.offers.price).toBe(25)
    expect(second.offers.price).toBe(15)
  })

  it('gives every product its own offer, which Google requires of a Product', () => {
    const ld = buildHomeCatalogJsonLd({ ...base, models: [gravel, classic] })!
    for (const product of ld.hasOfferCatalog.itemListElement) {
      expect(product['@type']).toBe('Product')
      expect(product.offers).toMatchObject({ '@type': 'Offer', priceCurrency: 'EUR' })
    }
    expect(JSON.stringify(ld)).not.toContain('itemOffered')
  })

  it('shares the business @id of the layout, so the two fragments merge', () => {
    const ld = buildHomeCatalogJsonLd({ ...base, models: [gravel] })!
    expect(ld['@id']).toBe('https://www.example.test/#business')
  })

  it('types bikes as products for hire, never as cars for sale', () => {
    const json = JSON.stringify(buildHomeCatalogJsonLd({ ...base, models: [gravel] }))
    expect(json).not.toContain('RentalCar')
    expect(json).toContain('LeaseOut')
  })

  it('leaves out a model with no day-1 price instead of pricing it at zero', () => {
    const noPrice = { ...gravel, category: category({ maxRentalDays: 0 }) }
    const ld = buildHomeCatalogJsonLd({ ...base, models: [noPrice, classic] })!
    expect(ld.hasOfferCatalog.itemListElement).toHaveLength(1)
  })

  it('returns nothing when there is nothing honest to list', () => {
    expect(buildHomeCatalogJsonLd({ ...base, models: [] })).toBeNull()
  })
})
