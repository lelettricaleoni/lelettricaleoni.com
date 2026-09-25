import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import it_ from '@/messages/it.json'
import en from '@/messages/en.json'
import de from '@/messages/de.json'

import { BikesTeaserSection } from './bikes-teaser-section'

const dictionaries = { it: it_, en, de } as const

describe('BikesTeaserSection', () => {
  for (const lang of ['it', 'en', 'de'] as const) {
    it(`renders its own copy and links to the bikes page in ${lang}`, () => {
      const dict = dictionaries[lang]
      const html = renderToStaticMarkup(<BikesTeaserSection lang={lang} dict={dict} />)

      expect(html).toContain('id="bikes-teaser"')
      expect(html).toContain(dict.bikes_teaser.title)
      expect(html).toContain(dict.bikes_teaser.copy)
      expect(html).toContain(dict.bikes_teaser.cta)
      expect(html).toContain(`href="/${lang}/bikes"`)
    })

    it(`lists the four families of the price list, by the price list's own names, in ${lang}`, () => {
      const dict = dictionaries[lang]
      const html = renderToStaticMarkup(<BikesTeaserSection lang={lang} dict={dict} />)

      for (const label of [
        dict.pricing.emtb_title,
        dict.pricing.gravel_city_title,
        dict.pricing.classic_bike_title,
        dict.pricing.classic_mtb_title,
      ]) {
        // `&` is escaped in markup, so compare against the escaped form.
        expect(html).toContain(label.replace(/&/g, '&amp;'))
      }
    })
  }

  it('is a different anchor from the routes teaser, so the two never collide', () => {
    const html = renderToStaticMarkup(<BikesTeaserSection lang="it" dict={it_} />)
    expect(html).not.toContain('routes-teaser')
  })
})

describe('bikes_teaser messages', () => {
  it('is filled in every language, and never a copy of the Italian text', () => {
    for (const dict of [it_, en, de]) {
      for (const key of ['title', 'copy', 'cta'] as const) {
        expect(dict.bikes_teaser[key].trim().length).toBeGreaterThan(0)
      }
    }
    for (const dict of [en, de]) {
      expect(dict.bikes_teaser.title).not.toBe(it_.bikes_teaser.title)
      expect(dict.bikes_teaser.copy).not.toBe(it_.bikes_teaser.copy)
      expect(dict.bikes_teaser.cta).not.toBe(it_.bikes_teaser.cta)
    }
  })
})
