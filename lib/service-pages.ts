import type { Locale } from '@/app/[lang]/dictionaries'

/**
 * Landing pages for searches that don't name the shop (Fase 2 in
 * docs/ai/ideas/search-strategy.md): four by service type, five by place
 * (Dro and the area north toward Pietramurata — Kevin, 2026-09-28, less
 * competition there than around Arco/Riva del Garda). The slug is the
 * search term itself, so it's translated per language rather than shared
 * across locales — unlike routes and bikes, which keep the same id in
 * every language. Not linked from anywhere on the site on purpose: Kevin
 * wants these reachable only by search, not by browsing.
 */
export type ServiceKey =
  | 'ebikeRental'
  | 'emtbRental'
  | 'gravelRental'
  | 'ebikeRepair'
  | 'ebikeRentalDrena'
  | 'ebikeRentalSarche'
  | 'ebikeRentalCavedine'
  | 'ebikeRentalMarocche'
  | 'ebikeRentalToblino'

export const SERVICE_KEYS: ServiceKey[] = [
  'ebikeRental',
  'emtbRental',
  'gravelRental',
  'ebikeRepair',
  'ebikeRentalDrena',
  'ebikeRentalSarche',
  'ebikeRentalCavedine',
  'ebikeRentalMarocche',
  'ebikeRentalToblino',
]

const SLUGS: Record<ServiceKey, Record<Locale, string>> = {
  ebikeRental: { it: 'noleggio-e-bike', en: 'e-bike-rental', de: 'e-bike-verleih' },
  emtbRental: { it: 'noleggio-emtb', en: 'emtb-rental', de: 'emtb-verleih' },
  gravelRental: { it: 'noleggio-gravel', en: 'gravel-bike-rental', de: 'gravel-bike-verleih' },
  ebikeRepair: { it: 'riparazione-e-bike', en: 'e-bike-repair', de: 'e-bike-reparatur' },
  ebikeRentalDrena: { it: 'noleggio-e-bike-drena', en: 'e-bike-rental-drena', de: 'e-bike-verleih-drena' },
  ebikeRentalSarche: { it: 'noleggio-e-bike-sarche', en: 'e-bike-rental-sarche', de: 'e-bike-verleih-sarche' },
  ebikeRentalCavedine: { it: 'noleggio-e-bike-cavedine', en: 'e-bike-rental-cavedine', de: 'e-bike-verleih-cavedine' },
  ebikeRentalMarocche: { it: 'noleggio-e-bike-marocche', en: 'e-bike-rental-marocche', de: 'e-bike-verleih-marocche' },
  ebikeRentalToblino: { it: 'noleggio-e-bike-toblino', en: 'e-bike-rental-toblino', de: 'e-bike-verleih-toblino' },
}

export type ServiceDictKey =
  | 'ebike_rental'
  | 'emtb_rental'
  | 'gravel_rental'
  | 'ebike_repair'
  | 'ebike_rental_drena'
  | 'ebike_rental_sarche'
  | 'ebike_rental_cavedine'
  | 'ebike_rental_marocche'
  | 'ebike_rental_toblino'

/** The messages/*.json key holding this service's content. */
const DICT_KEYS: Record<ServiceKey, ServiceDictKey> = {
  ebikeRental: 'ebike_rental',
  emtbRental: 'emtb_rental',
  gravelRental: 'gravel_rental',
  ebikeRepair: 'ebike_repair',
  ebikeRentalDrena: 'ebike_rental_drena',
  ebikeRentalSarche: 'ebike_rental_sarche',
  ebikeRentalCavedine: 'ebike_rental_cavedine',
  ebikeRentalMarocche: 'ebike_rental_marocche',
  ebikeRentalToblino: 'ebike_rental_toblino',
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

/**
 * The same page in another language. Routes and bikes keep their id across
 * languages, so for them only the first segment changes; a service page's slug
 * is the search term and differs per language, so it must be translated too —
 * swapping only the language sent visitors to `/it/e-bike-rental-drena`, a page
 * that does not exist, and Google followed those links.
 */
export function switchLocalePath(pathname: string, targetLang: Locale): string {
  const segments = pathname.split('/')
  const currentLang = segments[1]
  // Not `hasLocale` from dictionaries.ts: that module is `server-only`, and the
  // language switcher, a client component, calls this.
  if (segments.length === 3 && currentLang in SLUGS.ebikeRental) {
    const key = findServiceKeyBySlug(currentLang as Locale, segments[2])
    if (key) segments[2] = servicePageSlug(key, targetLang)
  }
  segments[1] = targetLang
  return segments.join('/') || '/'
}
