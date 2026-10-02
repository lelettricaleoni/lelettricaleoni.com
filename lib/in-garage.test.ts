import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * A bike that has been retired must not count as "in the garage" anywhere the public site decides
 * what to show: a model with no bike left disappears from the list, and a size nobody can rent
 * is not offered. Every query that reaches `bike_units` there must carry the `inGarage()`
 * condition, or a retired bike keeps being shown. This guard counts them.
 */
const PUBLIC_QUERIES = ['lib/bikes-data.ts', 'app/sitemap.ts']

// A reach into the table: `.from(bikeUnits)` or `.innerJoin(bikeUnits, ...)`.
const REACHES = /\.(?:from|innerJoin|leftJoin)\(\s*bikeUnits\b/g

describe('public queries on bike_units', () => {
  it.each(PUBLIC_QUERIES)('%s filters retired bikes wherever it reaches bike_units', (file) => {
    const source = readFileSync(file, 'utf8')
    const reaches = source.match(REACHES)?.length ?? 0
    const filters = source.match(/\binGarage\(\)/g)?.length ?? 0

    expect(reaches, `${file} no longer reaches bike_units: update this guard`).toBeGreaterThan(0)
    expect(filters, `${file}: ${reaches} places reach bike_units, only ${filters} filter retired bikes`).toBeGreaterThanOrEqual(reaches)
  })
})
