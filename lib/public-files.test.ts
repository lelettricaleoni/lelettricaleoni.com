import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * public/ is served to everyone, so a file goes there only when the site uses it. A banner and a
 * business card sat in public/pdf as working material for months; the banner carried the shop's Gmail
 * address, readable by anyone who knew the URL (2026-10-07). Working files go in temp/ (not versioned).
 */
const SOURCES = ['app', 'components', 'lib', 'messages']
// withFileTypes: the kind of each entry comes with the listing, so no separate stat of a path that could change before it is read.
const read = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? read(path) : /\.(tsx?|json)$/.test(path) && !/\.test\.tsx?$/.test(path) ? [readFileSync(path, 'utf8')] : []
  })

describe('public/pdf', () => {
  it('holds only files the site links to', () => {
    const code = [...SOURCES.flatMap((dir) => read(join(process.cwd(), dir))), readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')].join('\n')
    const unused = readdirSync(join(process.cwd(), 'public', 'pdf')).filter((file) => !code.includes(file))
    expect(unused, 'file in public/pdf che il sito non usa: va in temp/, non in public/').toEqual([])
  })
})
