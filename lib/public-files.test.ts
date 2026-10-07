import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * public/ is served to everyone, so a file goes there only when the site uses it. A banner and a
 * business card sat in public/pdf as working material for months; the banner carried the shop's Gmail
 * address, readable by anyone who knew the URL (2026-10-07). Working files go in temp/ (not versioned).
 */
const SOURCES = ['app', 'components', 'lib', 'messages']
const read = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? read(path) : /\.(tsx?|json)$/.test(path) && !/\.test\.tsx?$/.test(path) ? [readFileSync(path, 'utf8')] : []
  })

describe('public/pdf', () => {
  it('holds only files the site links to', () => {
    const code = [...SOURCES.flatMap((dir) => read(join(process.cwd(), dir))), readFileSync(join(process.cwd(), 'next.config.ts'), 'utf8')].join('\n')
    const unused = readdirSync(join(process.cwd(), 'public', 'pdf')).filter((file) => !code.includes(file))
    expect(unused, 'file in public/pdf che il sito non usa: va in temp/, non in public/').toEqual([])
  })
})
