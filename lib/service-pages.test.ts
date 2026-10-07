import { describe, it, expect } from 'vitest'
import { SERVICE_KEYS, servicePageSlug, switchLocalePath } from './service-pages'

describe('switchLocalePath', () => {
  it('translates the slug of a service page, not just the language', () => {
    expect(switchLocalePath('/en/e-bike-rental-drena', 'it')).toBe('/it/noleggio-e-bike-drena')
    expect(switchLocalePath('/it/noleggio-e-bike-cavedine', 'de')).toBe('/de/e-bike-verleih-cavedine')
    expect(switchLocalePath('/de/e-bike-reparatur', 'en')).toBe('/en/e-bike-repair')
  })

  it('round-trips every service page through every language', () => {
    for (const key of SERVICE_KEYS) {
      for (const from of ['it', 'en', 'de'] as const) {
        for (const to of ['it', 'en', 'de'] as const) {
          expect(switchLocalePath(`/${from}/${servicePageSlug(key, from)}`, to)).toBe(
            `/${to}/${servicePageSlug(key, to)}`
          )
        }
      }
    }
  })

  it('only swaps the language when the path is not a service page', () => {
    expect(switchLocalePath('/it', 'en')).toBe('/en')
    expect(switchLocalePath('/it/routes', 'de')).toBe('/de/routes')
    expect(switchLocalePath('/it/routes/aa7da601', 'en')).toBe('/en/routes/aa7da601')
    expect(switchLocalePath('/it/bikes/ae94644c', 'de')).toBe('/de/bikes/ae94644c')
  })

  it('leaves a slug alone when it belongs to no service page in that language', () => {
    expect(switchLocalePath('/it/e-bike-rental-drena', 'de')).toBe('/de/e-bike-rental-drena')
  })
})
