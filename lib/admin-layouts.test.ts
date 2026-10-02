import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Every section of the admin panel must be wrapped in AdminShell, which is the only place the
 * sidebar and the <Toaster /> live. A section without a layout renders bare: no sidebar, and
 * every toast.* call on it is silently dropped, so the person never sees an error message.
 * /manage/bookings shipped like that (found in review, 2026-10-02).
 *
 * The sign-in pages are the exception: they are outside the panel on purpose.
 */
const MANAGE = 'app/manage'
const OUTSIDE_THE_PANEL = new Set(['login', 'update-password'])

function sections(): string[] {
  return readdirSync(MANAGE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !OUTSIDE_THE_PANEL.has(entry.name))
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(MANAGE, name, 'page.tsx')))
}

describe('admin layouts', () => {
  it('finds the sections of the panel', () => {
    expect(sections()).toEqual(expect.arrayContaining(['bikes', 'bookings', 'routes', 'users']))
  })

  it.each(sections())('wraps /manage/%s in AdminShell', (section) => {
    const layout = join(MANAGE, section, 'layout.tsx')
    expect(existsSync(layout), `${layout} is missing: the section would have no sidebar and no toasts`).toBe(true)
    expect(readFileSync(layout, 'utf8')).toContain('AdminShell')
  })
})
