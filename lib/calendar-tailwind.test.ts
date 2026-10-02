import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * This project is on Tailwind v4, where a class that takes a CSS variable is written with
 * parentheses: `h-(--cell-size)`. The calendar that `npx shadcn@latest add calendar` generates
 * still uses the v3 spelling, `h-[--cell-size]`, which v4 does not turn into anything: the day
 * cells and the arrows then have no size and the whole calendar collapses to a 142 px column
 * with the digits glued together (seen in the maintenance dialog, 2026-10-02).
 *
 * If this fails after regenerating the component, rewrite the classes: `-[--x]` becomes `-(--x)`.
 */
const V3_VARIABLE_CLASS = /[a-zA-Z:-]+-\[--[a-zA-Z-]+\]/g

describe('components/ui/calendar.tsx', () => {
  it('writes classes that take a CSS variable the Tailwind v4 way', () => {
    const source = readFileSync('components/ui/calendar.tsx', 'utf8')
    expect(source.match(V3_VARIABLE_CLASS) ?? []).toEqual([])
  })

  it('still defines the cell size it uses', () => {
    const source = readFileSync('components/ui/calendar.tsx', 'utf8')
    expect(source).toContain('[--cell-size:')
    expect(source).toContain('(--cell-size)')
  })
})
