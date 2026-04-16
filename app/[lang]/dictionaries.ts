import 'server-only'

const dictionaries = {
  it: () => import('@/messages/it.json').then((m) => m.default),
  en: () => import('@/messages/en.json').then((m) => m.default),
  de: () => import('@/messages/de.json').then((m) => m.default),
}

export type Locale = keyof typeof dictionaries

export const hasLocale = (locale: string): locale is Locale =>
  locale in dictionaries

export const getDictionary = async (locale: Locale) => dictionaries[locale]()
