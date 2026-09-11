import { test, expect, type Browser, type Page } from '@playwright/test'

/**
 * Three numbers per page, each with a ceiling.
 *
 * What these are for: in June the home page went from 0,15 s to 6,2 s and
 * nothing said so; on 2026-09-10 /manage/routes answered between 18 and 49
 * seconds for hours, equally unnoticed. Both were a single measurement away
 * from being caught, and both cost real money — TTFB is the time the function
 * spends computing before it answers, which is the CPU Vercel bills against a
 * quota of four hours a month.
 *
 *   TTFB          the function computing
 *   Peso          bytes served by the deployment under test
 *   Richieste     an N+1 or one image variant too many shows up here first
 *
 * Only what the deployment itself serves is counted. Cesium terrain, ArcGIS
 * imagery, the analytics scripts and the media on R2 are somebody else's
 * bytes, they are not billed as Vercel compute, and they swing wildly between
 * two identical loads: the route detail page pulls between 42 and 328 requests
 * in total depending on how far the camera flies before the network goes
 * quiet, while the same-origin part of it does not move by one request. A
 * ceiling laid over that noise would be a lottery, and a lottery gets muted.
 * (Video weight is a real cost, but it belongs to the bitrate work on the
 * roadmap, not to a gate that must stay quiet when Kevin publishes a video.)
 */

/**
 * Measured on production, 2026-09-10, nine loads per page at 1440px, plus a
 * second run of nine the same afternoon.
 *
 * | Pagina        | TTFB mediano | TTFB peggiore | Peso        | Richieste |
 * |---------------|--------------|---------------|-------------|-----------|
 * | /it           | 69-102 ms    | 803 ms (cold) | 554-566 KB  | 25        |
 * | /it/routes    | 66-83 ms     | 184 ms        | 632-903 KB  | 43        |
 * | /it/routes/id | 64-81 ms     | 248 ms        | 2666-3675 KB| 37-47     |
 *
 * Where the spread comes from, so that the margins are not superstition:
 *
 * - TTFB. Warm the function answers in 55-100 ms. The 803 ms was the first
 *   load of the run, against a function that had gone cold — which is exactly
 *   what a freshly built preview is, so the first sample is thrown away and
 *   the rest are taken by median. 500 ms is roughly five times the warm
 *   median, and still an order of magnitude under both faults worth catching.
 * - Peso. The list page moved 632 → 903 KB between runs with the request
 *   count unchanged: Next prefetches the RSC payload of the cards in view, and
 *   how many it gets to depends on timing. The ceiling clears the worst run.
 * - Richieste. The detail page is bimodal, 37 or 47, depending on whether the
 *   3D map gets as far as loading its own chunks. The ceiling clears the
 *   larger case and leaves room for a few more routes: the list page grows by
 *   about one image request per published route.
 */
const BUDGETS = {
  home: { ttfb: 500, kb: 900, req: 40 },
  list: { ttfb: 500, kb: 1500, req: 60 },
  detail: { ttfb: 500, kb: 5000, req: 70 },
} as const

/**
 * Five loads, the first discarded, the median of the other four asserted.
 *
 * These run against a real deployment over the network, so a single sample is
 * worth little: a cold start, a slow DNS answer or a second worker fighting
 * for the runner's bandwidth all land on one load and none of them is a
 * regression. A median needs three of four samples to agree before it moves,
 * which no transient does. The discarded first load pays for the cold start
 * that a just-built preview always has.
 */
const SAMPLES = 5

// The weight and the request count are measured once, at the widest layout:
// they answer a question about the deployment, not about the viewport, and
// repeating them in all three projects would triple the network traffic to say
// the same thing three times. Geometry is the test that needs every width.
const BUDGET_PROJECT = 'tre-colonne'

interface Sample {
  ttfb: number
  kb: number
  req: number
}

/**
 * One load in a context of its own.
 *
 * Fresh every time on purpose: a second load in the same context is served
 * from the browser cache, which reports zero bytes and would quietly turn the
 * weight budget into a measure of nothing.
 */
async function measure(browser: Browser, path: string): Promise<Sample> {
  const { viewport, extraHTTPHeaders, baseURL } = test.info().project.use
  const context = await browser.newContext({ viewport, extraHTTPHeaders, baseURL })
  const page = await context.newPage()

  const origin = new URL(baseURL ?? 'http://localhost:3000').origin
  const sizes: Promise<number>[] = []

  let inFlight = 0
  let lastActivity = Date.now()
  const settle = () => { inFlight = Math.max(inFlight - 1, 0); lastActivity = Date.now() }
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) return
    inFlight++
    lastActivity = Date.now()
  })
  page.on('requestfinished', (request) => { if (request.url().startsWith(origin)) settle() })
  page.on('requestfailed', (request) => { if (request.url().startsWith(origin)) settle() })

  page.on('response', (response) => {
    if (!response.url().startsWith(origin)) return
    sizes.push(
      response
        .request()
        .sizes()
        .then((s) => Math.max(s.responseBodySize + s.responseHeadersSize, 0))
        // A request the browser abandons has no sizes to report; it still
        // counts as a request, which is why the entry stays in the array.
        .catch(() => 0),
    )
  })

  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  expect(response?.status(), `${path} non risponde`).toBeLessThan(400)
  expect(page.url(), 'reindirizzato al login: manca VERCEL_AUTOMATION_BYPASS_SECRET')
    .not.toContain('vercel.com/login')

  // Not 'networkidle': the cards stream HLS from R2 for as long as the page is
  // open, so the network never goes quiet and every load paid the full
  // timeout. What is counted here is the deployment's own traffic, so it is
  // the deployment's own traffic that has to go quiet — one second with
  // nothing in flight to this origin, after 'load', within ten seconds.
  await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {})
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline && (inFlight > 0 || Date.now() - lastActivity < 1_000)) {
    await page.waitForTimeout(100)
  }

  // requestStart is after the connection and the TLS handshake, so what is
  // left between it and the first byte is the round trip plus the time the
  // function took to produce that byte.
  const timing = response!.request().timing()
  const bytes = (await Promise.all(sizes)).reduce((a, b) => a + b, 0)
  await context.close()

  return { ttfb: Math.round(timing.responseStart - timing.requestStart), kb: Math.round(bytes / 1024), req: sizes.length }
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const half = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[half] : Math.round((sorted[half - 1] + sorted[half]) / 2)
}

async function samplesFor(browser: Browser, path: string): Promise<Sample[]> {
  const taken: Sample[] = []
  for (let i = 0; i < SAMPLES; i++) taken.push(await measure(browser, path))
  return taken.slice(1)
}

function assertBudget(path: string, taken: Sample[], budget: { ttfb: number; kb: number; req: number }) {
  const ttfb = taken.map((s) => s.ttfb)
  const kb = taken.map((s) => s.kb)
  const req = taken.map((s) => s.req)
  // Printed on success too: the ceilings are only as good as the numbers
  // they were set against, and those numbers drift.
  console.log(`${path}: TTFB ${median(ttfb)} ms, ${median(kb)} KB, ${median(req)} richieste`)

  expect(median(ttfb), `${path}: TTFB mediano ${median(ttfb)} ms, campioni [${ttfb.join(', ')}]`)
    .toBeLessThanOrEqual(budget.ttfb)
  expect(median(kb), `${path}: ${median(kb)} KB serviti dal deploy, campioni [${kb.join(', ')}]`)
    .toBeLessThanOrEqual(budget.kb)
  expect(median(req), `${path}: ${median(req)} richieste al deploy, campioni [${req.join(', ')}]`)
    .toBeLessThanOrEqual(budget.req)
}

/** The first published route, because the id is data and the data changes. */
async function firstRoutePath(page: Page): Promise<string> {
  await page.goto('/it/routes', { waitUntil: 'domcontentloaded' })
  const href = await page
    .locator('a[href*="/routes/"]')
    .filter({ has: page.locator('h3') })
    .first()
    .getAttribute('href')
  expect(href, 'nessun percorso da misurare').toBeTruthy()
  return href!
}

test.beforeEach(() => {
  test.skip(test.info().project.name !== BUDGET_PROJECT, `i budget si misurano solo a ${BUDGET_PROJECT}`)
  // Five loads, each allowed up to twenty seconds to settle, do not fit in the
  // 30 s the other browser tests need.
  test.setTimeout(180_000)
})

test('la home resta dentro il suo budget', async ({ browser }) => {
  assertBudget('/it', await samplesFor(browser, '/it'), BUDGETS.home)
})

test('la lista percorsi resta dentro il suo budget', async ({ browser }) => {
  assertBudget('/it/routes', await samplesFor(browser, '/it/routes'), BUDGETS.list)
})

test('il dettaglio di un percorso resta dentro il suo budget', async ({ browser, page }) => {
  const path = await firstRoutePath(page)
  assertBudget(path, await samplesFor(browser, path), BUDGETS.detail)
})
