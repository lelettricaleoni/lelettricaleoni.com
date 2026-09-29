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

// No 'networkidle' anywhere: the video on the cards never stops fetching, so
// that wait always ran to its timeout — see visit() in geometry.spec.ts. The
// assertions below retry on their own until the content arrives.
async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })

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
  // The routes teaser is gated by the same flag as the routes section
  // itself, so this doubles as a check that the flag is on in whichever
  // environment the suite is pointed at.
  const teaser = page.locator('#routes-teaser')
  await expect(teaser).toBeAttached()
  await expect(teaser.locator('a[href*="/routes"]')).toBeVisible()
  // Same for the bikes teaser and the bikes flag: the bikes tests below
  // already need it on, so this adds no assumption about the environment.
  const bikesTeaser = page.locator('#bikes-teaser')
  await expect(bikesTeaser).toBeAttached()
  await expect(bikesTeaser.locator('a[href*="/bikes"]')).toBeVisible()
})

test('la home non dipende da CDN esterni', async ({ page }) => {
  // Regola del progetto: tutto self-hosted (eccezioni volute: mappe e analytics).
  // Le bandierine della lingua venivano da cdn.jsdelivr.net — lo faceva la
  // libreria per default, senza che il codice lo dicesse — e nessun test se ne
  // accorgeva.
  const cdnHosts = new Set(['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com'])
  const external: string[] = []
  page.on('request', (request) => {
    // The exact host, not a substring of the URL: a match anywhere in the string
    // would also catch a page that merely names a CDN in a query.
    if (cdnHosts.has(new URL(request.url()).hostname)) external.push(request.url())
  })
  await visit(page, '/it')
  await page.waitForLoadState('load')
  expect(external, 'la home carica risorse da un CDN esterno').toEqual([])
})

test('la lista percorsi mostra delle card complete', async ({ page }) => {
  await visit(page, '/it/routes')

  const cards = page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
  const count = await cards.count()
  expect(count, 'nessun percorso nella lista').toBeGreaterThan(0)

  const first = cards.first()
  await expect(first.locator('h3')).not.toBeEmpty()
  // Three stats: distance, elevation, duration — surface was dropped on
  // 2026-09-14. Fewer than that meant a cut-off band that shipped twice on
  // 2026-09-10.
  await expect(first.locator('.divide-x > div')).toHaveCount(3)
})

test('il dettaglio di un percorso mostra titolo e statistiche', async ({ page }) => {
  await visit(page, '/it/routes')

  const href = await page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessun percorso da aprire').toBeTruthy()

  await visit(page, href!)
  await expect(page.locator('h1')).not.toBeEmpty()
  // The stat tiles carry the units, and are the page's reason to exist.
  await expect(page.getByText('durata', { exact: false }).first()).toBeVisible()
})

test('il dettaglio di un percorso apre i media a schermo intero', async ({ page }) => {
  // Regressione 2026-09-25/28: passare styles={undefined} (invece di ometterlo
  // o passare {}) al lightbox lo fa fallire in silenzio sul primo click — nessuna
  // eccezione visibile all'utente, solo un errore in console. Coperto qui perché
  // nessun altro test apriva mai il lightbox.
  await visit(page, '/it/routes')
  const href = await page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessun percorso da aprire').toBeTruthy()
  await visit(page, href!)

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  // visit() only waits for domcontentloaded, so the button can exist before
  // React attaches its onClick — retry the click until hydration catches up.
  await expect(async () => {
    await page.locator('button[aria-label*="media 1"]').first().click()
    await expect(page.locator('.yarl__slide').first()).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  expect(errors, 'il lightbox lancia un errore JS aprendosi').toEqual([])
})

test('la privacy ha il suo testo, non un guscio', async ({ page }) => {
  await visit(page, '/it/privacy')
  // Questa pagina non usa <main>, quindi si guarda il corpo meno le parti
  // comuni: quello che resta è la policy. Con expect.poll e non con una
  // lettura sola: il testo arriva in streaming dopo il titolo, e leggerlo
  // subito misurava il guscio.
  await expect(page.locator('h1')).not.toBeEmpty()
  await expect
    .poll(async () => (await page.locator('body').innerText()).length, {
      message: 'pagina privacy troppo corta per contenere una policy',
    })
    .toBeGreaterThan(1000)
})

test('il tedesco rende in tedesco', async ({ page }) => {
  await visit(page, '/de/routes')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')

  // The dictionaries are what could silently fall back to Italian. Wait for
  // the page to have content first: a negative check on a page that has not
  // arrived yet passes without looking at anything.
  await expect(page.locator('main h1').first()).not.toBeEmpty()
  // While the page streams in, the loading skeleton's <main> and the real one
  // are both in the DOM, with the same classes. Reading `main` in that window
  // is a strict-mode violation, which is what made this test flaky (four PRs,
  // then twice in one run). One <main> means the swap is done.
  await expect(page.locator('main')).toHaveCount(1)
  const text = await page.locator('main').innerText()
  expect(text).not.toContain('Percorsi consigliati')
})

test('una pagina inesistente non finge di esistere', async ({ page }) => {
  await page.goto('/it/routes/00000000', { waitUntil: 'domcontentloaded' })

  // The status is 200 here — streaming again — so Next marks the page noindex
  // instead. That tag is the only honest signal, and the site's SEO rests on it.
  //
  // The page carries the site's own "index, follow" as well, and hydration
  // leaves more than one copy of the injected tag. What matters is that a
  // noindex is there at all — counting them would make this a test of Next's
  // hydration rather than of the site's SEO.
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
})

test('la lista bici mostra delle card complete', async ({ page }) => {
  await visit(page, '/it/bikes')

  const cards = page.locator('a[href*="/bikes/"]').filter({ has: page.locator('h3') })
  const count = await cards.count()
  expect(count, 'nessuna bici nella lista').toBeGreaterThan(0)

  const first = cards.first()
  await expect(first.locator('h3')).not.toBeEmpty()
})

test('il dettaglio di una bici mostra titolo e prezzo', async ({ page }) => {
  await visit(page, '/it/bikes')

  const href = await page.locator('a[href*="/bikes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessuna bici da aprire').toBeTruthy()

  await visit(page, href!)
  await expect(page.locator('h1')).not.toBeEmpty()
  await expect(page.getByText('€', { exact: false }).first()).toBeVisible()
})

test('il dettaglio di una bici apre i media a schermo intero', async ({ page }) => {
  await visit(page, '/it/bikes')
  const href = await page.locator('a[href*="/bikes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessuna bici da aprire').toBeTruthy()
  await visit(page, href!)

  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await expect(async () => {
    await page.locator('button[aria-label*="media 1"]').first().click()
    await expect(page.locator('.yarl__slide').first()).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 10_000 })
  expect(errors, 'il lightbox lancia un errore JS aprendosi').toEqual([])
})

// Solo per indicizzazione (docs/ai/ideas/search-strategy.md, Fase 2): in
// sitemap, ma senza link da home/navbar/lista bici — Kevin le vuole
// raggiungibili solo da chi cerca, non da chi naviga il sito.
const SERVICE_PAGES = [
  { path: '/it/noleggio-e-bike', h1Contains: 'Noleggio e-bike' },
  { path: '/it/noleggio-emtb', h1Contains: 'Noleggio eMTB' },
  { path: '/it/noleggio-gravel', h1Contains: 'gravel' },
  { path: '/it/riparazione-e-bike', h1Contains: 'Riparazione' },
  { path: '/en/e-bike-rental', h1Contains: 'E-Bike Rental' },
  { path: '/en/emtb-rental', h1Contains: 'eMTB Rental' },
  { path: '/en/gravel-bike-rental', h1Contains: 'Gravel' },
  { path: '/en/e-bike-repair', h1Contains: 'E-Bike Repair' },
  { path: '/de/e-bike-verleih', h1Contains: 'E-Bike Verleih' },
  { path: '/de/emtb-verleih', h1Contains: 'eMTB Verleih' },
  { path: '/de/gravel-bike-verleih', h1Contains: 'Gravelbike' },
  { path: '/de/e-bike-reparatur', h1Contains: 'Reparatur' },
  { path: '/it/noleggio-e-bike-drena', h1Contains: 'Drena' },
  { path: '/it/noleggio-e-bike-sarche', h1Contains: 'Sarche' },
  { path: '/it/noleggio-e-bike-cavedine', h1Contains: 'Cavedine' },
  { path: '/it/noleggio-e-bike-marocche', h1Contains: 'Marocche' },
  { path: '/it/noleggio-e-bike-toblino', h1Contains: 'Toblino' },
  { path: '/en/e-bike-rental-drena', h1Contains: 'Drena' },
  { path: '/en/e-bike-rental-sarche', h1Contains: 'Sarche' },
  { path: '/en/e-bike-rental-cavedine', h1Contains: 'Cavedine' },
  { path: '/en/e-bike-rental-marocche', h1Contains: 'Marocche' },
  { path: '/en/e-bike-rental-toblino', h1Contains: 'Toblino' },
  { path: '/de/e-bike-verleih-drena', h1Contains: 'Drena' },
  { path: '/de/e-bike-verleih-sarche', h1Contains: 'Sarche' },
  { path: '/de/e-bike-verleih-cavedine', h1Contains: 'Cavedine' },
  { path: '/de/e-bike-verleih-marocche', h1Contains: 'Marocche' },
  { path: '/de/e-bike-verleih-toblino', h1Contains: 'Toblino' },
]

for (const { path, h1Contains } of SERVICE_PAGES) {
  test(`pagina di servizio ${path} mostra titolo, prezzi e un contatto`, async ({ page }) => {
    await visit(page, path)
    await expect(page.locator('h1')).toContainText(h1Contains)
    // Riusa <PricingSection>, la stessa della home: qui basta che sia presente.
    await expect(page.locator('#prezzi')).toBeAttached()
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible()
  })
}

test('uno slug di servizio sconosciuto non finge di esistere', async ({ page }) => {
  await page.goto('/it/questo-slug-non-esiste', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached()
})

test('la radice manda alla lingua con un redirect temporaneo, che dipende da Accept-Language', async ({ request }) => {
  // Era un 301: la lingua viene dal browser di chi chiede, quindi lo stesso URL
  // porta a /de per uno e a /it per l'altro, e un redirect permanente dice a
  // browser e Google che "/" vale sempre una lingua sola.
  for (const [lingua, atteso] of [['de', '/de'], ['it', '/it'], ['en', '/en']] as const) {
    const res = await request.get('/', { maxRedirects: 0, headers: { 'accept-language': lingua } })
    expect(res.status(), `/ con Accept-Language ${lingua}`).toBe(307)
    expect(new URL(res.headers()['location'], 'https://x.test').pathname).toBe(atteso)
    expect(res.headers()['vary'] ?? '').toMatch(/accept-language/i)
  }

  // Chi non manda l'header (un crawler) finisce sull'italiano.
  const senza = await request.get('/', { maxRedirects: 0, headers: { 'accept-language': '' } })
  expect(new URL(senza.headers()['location'], 'https://x.test').pathname).toBe('/it')
})
