import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { SectionStack } from './section-stack'

// The tone of each wrapper, in order, from the markup.
function tones(html: string): string[] {
  return [...html.matchAll(/<div class="bg-(slate-50|white)">/g)].map((m) => m[1])
}

describe('SectionStack', () => {
  it('alternates, counting from the bottom so the last section is always grey', () => {
    const html = renderToStaticMarkup(
      <SectionStack>
        <section id="a" />
        <section id="b" />
        <section id="c" />
        <section id="d" />
      </SectionStack>
    )
    expect(tones(html)).toEqual(['white', 'slate-50', 'white', 'slate-50'])
  })

  it('skips a switched-off section instead of leaving two of the same tone together', () => {
    const on = renderToStaticMarkup(
      <SectionStack>
        <section id="routes" />
        <section id="services" />
        <section id="bikes" />
        <section id="pricing" />
        <section id="contacts" />
      </SectionStack>
    )
    const bikesOff = renderToStaticMarkup(
      <SectionStack>
        <section id="routes" />
        <section id="services" />
        {false}
        <section id="pricing" />
        <section id="contacts" />
      </SectionStack>
    )
    expect(tones(on)).toEqual(['slate-50', 'white', 'slate-50', 'white', 'slate-50'])
    expect(tones(bikesOff)).toEqual(['white', 'slate-50', 'white', 'slate-50'])
    // Pricing (second to last) is white and contacts (last) grey, flags or no flags.
    expect(tones(on).slice(-2)).toEqual(['white', 'slate-50'])
    expect(tones(bikesOff).slice(-2)).toEqual(['white', 'slate-50'])
  })

  it('renders each section once, inside its wrapper', () => {
    const html = renderToStaticMarkup(
      <SectionStack>
        <section id="only" />
      </SectionStack>
    )
    expect(html).toBe('<div class="bg-slate-50"><section id="only"></section></div>')
  })
})
