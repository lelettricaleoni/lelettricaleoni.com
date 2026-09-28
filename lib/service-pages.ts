import type { Locale } from '@/app/[lang]/dictionaries'

/**
 * The four landing pages for searches that don't name the shop (Fase 2 in
 * docs/ai/ideas/search-strategy.md). The slug is the search term itself, so
 * it's translated per language rather than shared across locales — unlike
 * routes and bikes, which keep the same id in every language.
 */
export type ServiceKey = 'ebikeRental' | 'emtbRental' | 'gravelRental' | 'ebikeRepair'

export const SERVICE_KEYS: ServiceKey[] = ['ebikeRental', 'emtbRental', 'gravelRental', 'ebikeRepair']

const SLUGS: Record<ServiceKey, Record<Locale, string>> = {
  ebikeRental: { it: 'noleggio-e-bike', en: 'e-bike-rental', de: 'e-bike-verleih' },
  emtbRental: { it: 'noleggio-emtb', en: 'emtb-rental', de: 'emtb-verleih' },
  gravelRental: { it: 'noleggio-gravel', en: 'gravel-bike-rental', de: 'gravel-bike-verleih' },
  ebikeRepair: { it: 'riparazione-e-bike', en: 'e-bike-repair', de: 'e-bike-reparatur' },
}

export type ServiceDictKey = 'ebike_rental' | 'emtb_rental' | 'gravel_rental' | 'ebike_repair'

/** The messages/*.json key holding this service's content. */
const DICT_KEYS: Record<ServiceKey, ServiceDictKey> = {
  ebikeRental: 'ebike_rental',
  emtbRental: 'emtb_rental',
  gravelRental: 'gravel_rental',
  ebikeRepair: 'ebike_repair',
}

export function servicePageSlug(key: ServiceKey, lang: Locale): string {
  return SLUGS[key][lang]
}

export function servicePageDictKey(key: ServiceKey): ServiceDictKey {
  return DICT_KEYS[key]
}

export function findServiceKeyBySlug(lang: Locale, slug: string): ServiceKey | undefined {
  return SERVICE_KEYS.find((key) => SLUGS[key][lang] === slug)
}
