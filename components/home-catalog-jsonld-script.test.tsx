import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getBikeModelsListData = vi.fn()
const getBikeCoverPhotoKeys = vi.fn()
vi.mock('@/lib/bikes-data', () => ({
  getBikeModelsListData: (...a: unknown[]) => getBikeModelsListData(...a),
  getBikeCoverPhotoKeys: (...a: unknown[]) => getBikeCoverPhotoKeys(...a),
}))

import { HomeCatalogJsonLd } from './home-catalog-jsonld-script'

const props = { lang: 'it' as const, siteUrl: 'https://www.example.test', name: 'Le nostre bici' }

const model = {
  model: { id: 'aa7da601-1111-2222-3333-444455556666', priceAdjustmentPercent: '0' },
  translation: { name: 'Mondraker Arid S' },
  category: {
    id: 'c', name: 'Gravel', displayOrder: 0, routeCategoryId: null, maxRentalDays: 5, pricingMode: 'table',
    day1Price: '25', day2Price: null, day3Price: null, day4Price: null, day5Price: null, day6Price: null,
    day7Price: null, perDayAfterPrice: null, afternoonPrice: null,
  },
}

beforeEach(() => {
  vi.useFakeTimers()
  getBikeModelsListData.mockReset()
  getBikeCoverPhotoKeys.mockReset()
  getBikeCoverPhotoKeys.mockResolvedValue({ [model.model.id]: 'private/bike-model-photos/aa7da601/p1.jpg' })
})
afterEach(() => vi.useRealTimers())

describe('HomeCatalogJsonLd never holds the home page hostage', () => {
  it('gives up after the timeout when the database does not answer', async () => {
    getBikeModelsListData.mockReturnValue(new Promise(() => {}))
    const result = HomeCatalogJsonLd(props)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await result).toBeNull()
  })

  it('renders nothing, and does not throw, when the read fails', async () => {
    getBikeModelsListData.mockRejectedValue(new Error('pooler down'))
    expect(await HomeCatalogJsonLd(props)).toBeNull()
  })

  it('gives up just the same when the photos are what does not answer', async () => {
    getBikeModelsListData.mockResolvedValue([model])
    getBikeCoverPhotoKeys.mockReturnValue(new Promise(() => {}))
    const result = HomeCatalogJsonLd(props)
    await vi.advanceTimersByTimeAsync(2000)
    expect(await result).toBeNull()
  })

  it('renders the script when the catalogue arrives', async () => {
    getBikeModelsListData.mockResolvedValue([model])
    const el = await HomeCatalogJsonLd(props)
    expect(el).not.toBeNull()
    const html = (el!.props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html
    expect(JSON.parse(html).hasOfferCatalog.itemListElement).toHaveLength(1)
  })

  it('cannot be closed early by a "</script>" in a bike name', async () => {
    const evil = { ...model, translation: { name: '</script><script>alert(1)</script>' } }
    getBikeModelsListData.mockResolvedValue([evil])
    const el = await HomeCatalogJsonLd(props)
    const html = (el!.props as { dangerouslySetInnerHTML: { __html: string } }).dangerouslySetInnerHTML.__html
    expect(html).not.toContain('</script>')
    expect(JSON.parse(html).hasOfferCatalog.itemListElement[0].name).toBe('</script><script>alert(1)</script>')
  })
})
