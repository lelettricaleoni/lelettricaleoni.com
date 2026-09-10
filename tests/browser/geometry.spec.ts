import { test, expect, type Page } from '@playwright/test'

/**
 * Nothing may spill out of the box that holds it.
 *
 * On 2026-09-10 two versions of the route cards reached production with their
 * stats band cut off — first three cells of four, then still three after a fix
 * that only looked right. Both were a single measurement away from being
 * caught, and both were invisible at one column and obvious at three, which is
 * why the widths are projects in the config rather than a detail in here.
 */

const PAGES = ['/it', '/it/routes', '/it/privacy'] as const

/**
 * Slack in CSS pixels.
 *
 * Enough to absorb sub-pixel rounding and the small negative margins used to
 * align an icon to its optical edge — `-mr-1` on the mobile menu button puts it
 * 4px past its parent on purpose. Far below the 67px that the broken cards
 * spilled, which is the scale of fault this is here to catch.
 */
const TOLERANCE = 8

interface Overflow {
  element: string
  parent: string
  oltreDi: number
}

/**
 * Elements that stick out on purpose, and must not be reported.
 *
 * Each entry is a reason, not a silencer: if one of these ever needs adding
 * without a reason, the assertion has stopped being worth having.
 */
function findOverflows(tolerance: number): Overflow[] {
  const describe = (el: Element) => {
    const tag = el.tagName.toLowerCase()
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 3).join('.') : ''
    return cls ? `${tag}.${cls}` : tag
  }

  const out: Overflow[] = []

  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el)

    // Invisible things have no geometry worth judging.
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
    // Taken out of flow: a badge pinned to a corner, a dropdown, a modal.
    if (style.position === 'fixed' || style.position === 'absolute') continue
    // Deliberately larger than its box, and scrolled by hand — the bike tags.
    if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue

    const parent = el.parentElement
    if (!parent || parent === document.body) continue
    const parentStyle = getComputedStyle(parent)
    // A parent that scrolls or clips is expecting bigger children.
    if (parentStyle.overflowX === 'auto' || parentStyle.overflowX === 'scroll') continue

    const r = el.getBoundingClientRect()
    const pr = parent.getBoundingClientRect()
    if (r.width === 0 || pr.width === 0) continue

    const oltre = Math.max(r.right - pr.right, pr.left - r.left)
    if (oltre > tolerance) {
      out.push({ element: describe(el), parent: describe(parent), oltreDi: Math.round(oltre) })
    }
  }

  return out
}

/**
 * Reach a page and wait for its layout to settle.
 *
 * Not 'load': a streamed page can hold its connection open long after the
 * layout is final, and the dev server does exactly that — waiting for it turns
 * a layout test into a timeout that says nothing about layout. The cards being
 * present is the real signal that there is something to measure.
 */
async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  // Images settle late and change layout when they do; a page with none must
  // not wait the full timeout for an event that will not come.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  return response
}

async function overflowsOn(page: Page): Promise<Overflow[]> {
  // La funzione viene serializzata ed eseguita nel browser: nulla del
  // modulo è in scope, quindi la tolleranza va passata come argomento.
  return page.evaluate(findOverflows, TOLERANCE)
}

for (const path of PAGES) {
  test(`${path}: niente sborda dal proprio contenitore`, async ({ page }) => {
    const response = await visit(page, path)
    // Not the assertion — just enough to tell a broken deploy from a layout bug.
    expect(response?.status(), `${path} non risponde`).toBeLessThan(400)

    // A protected preview answers with Vercel's own login page, which has a
    // perfectly good layout and would let every assertion below pass while
    // measuring nothing. Fail loudly instead.
    expect(page.url(), 'reindirizzato al login: manca VERCEL_AUTOMATION_BYPASS_SECRET')
      .not.toContain('vercel.com/login')

    const overflows = await overflowsOn(page)
    expect(overflows, `${path}: ${overflows.length} elementi fuori dal contenitore`).toEqual([])
  })

  test(`${path}: la pagina non scorre in orizzontale`, async ({ page }) => {
    await visit(page, path)

    const { scroll, client } = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(scroll, 'la pagina è più larga della finestra').toBeLessThanOrEqual(client + TOLERANCE)
  })
}
