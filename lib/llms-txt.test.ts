import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { config } from '../proxy'

const file = readFileSync(join(process.cwd(), 'public', 'llms.txt'), 'utf8')

// What Search Console checks: a Markdown file with an H1 and at least one link.
describe('public/llms.txt', () => {
  it('opens with an H1, which is what makes it a valid llms.txt', () => {
    expect(file.split('\n')[0]).toMatch(/^# \S/)
  })

  it('has links, all absolute and on this site', () => {
    const links = [...file.matchAll(/\]\((\S+?)\)/g)].map((m) => m[1])
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toMatch(/^https:\/\/www\.lelettricaleoni\.com\//)
  })

  it('is not behind the locale redirect', () => {
    // It used to be sent to /it/llms.txt, which served the home page as HTML.
    const pattern = new RegExp(`^${config.matcher[0]}$`)
    expect(pattern.test('/llms.txt')).toBe(false)
    expect(pattern.test('/bikes')).toBe(true)
  })
})
