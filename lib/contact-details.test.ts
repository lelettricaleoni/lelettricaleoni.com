import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The shop's Gmail address must not appear on the site, in any form a visitor or a crawler can read:
 * the pages, the structured data, the messages, the files served from public/. The site shows the
 * address of the domain (docs/contact-details.md). It was in the structured data of every page,
 * invisible to people and fully readable to robots.
 */
const FORBIDDEN = 'lelettricaleoni@gmail.com'
const SERVED = ['app', 'components', 'lib', 'messages', 'public']

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'cesium' || name === 'migrations') return []
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

describe('contact details', () => {
  it('does not put the Gmail address of the shop anywhere the site is made from', () => {
    const offenders = SERVED.flatMap((dir) => walk(join(process.cwd(), dir)))
      .filter((path) => /\.(tsx?|json|txt|md|xml|html)$/.test(path))
      .filter((path) => !/\.test\.tsx?$/.test(path))
      .filter((path) => readFileSync(path, 'utf8').includes(FORBIDDEN))
    expect(offenders).toEqual([])
  })
})
