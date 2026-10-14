import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAINTENANCE_COLOR, MODEL_COLORS, hexColorSchema, nextModelColor } from './bike-colors'

describe('nextModelColor', () => {
  it('starts with the first colour', () => {
    expect(nextModelColor([])).toBe(MODEL_COLORS[0].hex)
  })

  it('gives the colour used the least, the first one on a tie', () => {
    expect(nextModelColor([MODEL_COLORS[0].hex])).toBe(MODEL_COLORS[1].hex)
    expect(nextModelColor([MODEL_COLORS[0].hex, MODEL_COLORS[1].hex])).toBe(MODEL_COLORS[2].hex)
    // The first is taken twice and the second once: a colour nobody has comes before any repeat.
    expect(nextModelColor([MODEL_COLORS[0].hex, MODEL_COLORS[0].hex, MODEL_COLORS[1].hex])).toBe(MODEL_COLORS[2].hex)
  })

  it('repeats only once every colour is taken, starting again from the first', () => {
    const all = MODEL_COLORS.map((color) => color.hex)
    expect(nextModelColor(all)).toBe(MODEL_COLORS[0].hex)
    expect(nextModelColor([...all, MODEL_COLORS[0].hex])).toBe(MODEL_COLORS[1].hex)
  })

  it('ignores a colour picked by hand, a missing one and the case of the letters', () => {
    expect(nextModelColor(['#123456', null])).toBe(MODEL_COLORS[0].hex)
    expect(nextModelColor([MODEL_COLORS[0].hex.toUpperCase()])).toBe(MODEL_COLORS[1].hex)
  })

  it('never offers the grey of the maintenance', () => {
    expect(MODEL_COLORS.map((color) => color.hex)).not.toContain(MAINTENANCE_COLOR)
  })
})

describe('hexColorSchema', () => {
  it('accepts #rrggbb in any case, and gives it back in lowercase', () => {
    expect(hexColorSchema.parse('#8E24AA')).toBe('#8e24aa')
  })

  it('refuses anything else', () => {
    for (const value of ['', '8e24aa', '#8e24a', '#8e24aaff', '#gggggg', 'red', 'rgb(1,2,3)']) {
      expect(hexColorSchema.safeParse(value).success, value).toBe(false)
    }
  })
})

describe('migration 0026', () => {
  it('gives the first models the same colours, in the same order, as the list in the code', () => {
    const sql = readFileSync('lib/db/migrations/0026_model_color.sql', 'utf8')
    const listed = [...sql.matchAll(/ARRAY\[([^\]]+)\]/g)][0][1].match(/#[0-9a-f]{6}/g)
    expect(listed).toEqual(MODEL_COLORS.map((color) => color.hex))
    expect(sql).toContain(`% ${MODEL_COLORS.length}) + 1`)
  })
})
