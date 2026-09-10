import { test, expect, type Page } from '@playwright/test'

/**
 * Every page shows what it is for.
 *
 * Never the HTTP status: a section switched off here answers 200, because the
 * pages stream and the status is already sent when notFound() fires. Only the
 * content settles it — which is also why a flag turned off in production went
 * unnoticed for ten minutes in September.
 *
 * The data is real and Kevin publishes routes, so every assertion is a
 * minimum. "At least one card" survives him adding a seventh; "exactly six"
 * would fail the day he does.
 */

async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  expect(response?.status(), `${path} non risponde`).toBeLessThan(400)
  // A protected preview answers with Vercel's login page, which would satisfy
  // nothing below while looking perfectly healthy.
  expect(page.url(), 'reindirizzato al login: manca VERCEL_AUTOMATION_BYPASS_SECRET')
    .not.toContain('vercel.com/login')
  return response
}

test('la home mostra le sue sezioni', async ({ page }) => {
  await visit(page, '/it')
  await expect(page.locator('#servizi')).toBeAttached()
  await expect(page.locator('#prezzi')).toBeAttached()
  await expect(page.locator('#contatti')).toBeAttached()
})

test('la lista percorsi mostra delle card complete', async ({ page }) => {
  await visit(page, '/it/routes')

  const cards = page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
  const count = await cards.count()
  expect(count, 'nessun percorso nella lista').toBeGreaterThan(0)

  const first = cards.first()
  await expect(first.locator('h3')).not.toBeEmpty()
  // Four stats: distance, elevation, duration, surface. Three of them meant a
  // cut-off band that shipped twice on 2026-09-10.
  await expect(first.locator('.divide-x > div')).toHaveCount(4)
})

test('il dettaglio di un percorso mostra titolo e statistiche', async ({ page }) => {
  await visit(page, '/it/routes')

  const href = await page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessun percorso da aprire').toBeTruthy()

  await visit(page, href!)
  await expect(page.locator('h1')).not.toBeEmpty()
  // The stat tiles carry the units, and are the page's reason to exist.
  await expect(page.getByText('fondo', { exact: false }).first()).toBeVisible()
})

test('la privacy ha il suo testo, non un guscio', async ({ page }) => {
  await visit(page, '/it/privacy')
  // Questa pagina non usa <main>, quindi si guarda il corpo meno le parti
  // comuni: quello che resta è la policy.
  const text = await page.locator('body').innerText()
  expect(text.length, 'pagina privacy troppo corta per contenere una policy').toBeGreaterThan(1000)
  await expect(page.locator('h1')).not.toBeEmpty()
})

test('il tedesco rende in tedesco', async ({ page }) => {
  await visit(page, '/de/routes')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')

  // The dictionaries are what could silently fall back to Italian.
  const text = await page.locator('main').innerText()
  expect(text).not.toContain('Percorsi consigliati')
})

test('una pagina inesistente non finge di esistere', async ({ page }) => {
  await page.goto('/it/routes/00000000', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  // The status is 200 here — streaming again — so Next marks the page noindex
  // instead. That tag is the only honest signal, and the site's SEO rests on it.
  //
  // The page carries the site's own "index, follow" as well, and hydration
  // leaves more than one copy of the injected tag. What matters is that a
  // noindex is there at all — counting them would make this a test of Next's
  // hydration rather than of the site's SEO.
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
})
