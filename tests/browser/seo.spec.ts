import { test, expect, type Page } from '@playwright/test'

/**
 * Ogni pagina condivisa sui social deve mostrare titolo, descrizione e URL
 * PROPRI — non quelli della home page.
 *
 * Next.js non fa merge profondo di `openGraph` col layout radice: una pagina
 * che non lo imposta eredita l'intero blocco della home (inclusa la sua URL,
 * sempre `/it`), e una pagina che lo imposta solo in parte perde i campi che
 * non ripete (locale, sito, tipo...). Scoperto condividendo /it/bikes: la
 * preview mostrava titolo, testo e link della home invece che della pagina
 * bici — vedi lib/metadata.ts.
 */

async function visit(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
  expect(response?.status(), `${path} non risponde`).toBeLessThan(400)
  expect(page.url(), 'reindirizzato al login: manca VERCEL_AUTOMATION_BYPASS_SECRET')
    .not.toContain('vercel.com/login')
}

// .first(): un tag può comparire più volte durante l'idratazione (vedi
// content.spec.ts, "una pagina inesistente non finge di esistere"), e qui
// interessa solo che il valore sia quello giusto, non contarne le copie.
async function ogContent(page: Page, property: string): Promise<string | null> {
  return page.locator(`meta[property="${property}"]`).first().getAttribute('content')
}

const PAGES = [
  { path: '/it/bikes', titleContains: 'bici' },
  { path: '/it/routes', titleContains: 'ercorsi' },
  { path: '/it/privacy', titleContains: 'Privacy' },
]

for (const { path, titleContains } of PAGES) {
  test(`${path}: og:url e og:title sono della pagina, non della home`, async ({ page }) => {
    await visit(page, path)

    const url = await ogContent(page, 'og:url')
    expect(url, `og:url mancante su ${path}`).toContain(path)

    const title = await ogContent(page, 'og:title')
    expect(title, `og:title mancante su ${path}`).toBeTruthy()
    expect(title!.toLowerCase()).toContain(titleContains.toLowerCase())
  })
}

test('la home e la lista bici hanno og:title diversi', async ({ page }) => {
  await visit(page, '/it')
  const homeTitle = await ogContent(page, 'og:title')

  await visit(page, '/it/bikes')
  const bikesTitle = await ogContent(page, 'og:title')

  expect(bikesTitle, 'la lista bici mostra ancora il titolo della home').not.toBe(homeTitle)
})

test('il dettaglio di un percorso non perde i campi ereditati dal layout', async ({ page }) => {
  // Il dettaglio imposta solo title/description/image/url nel proprio
  // openGraph: senza un merge esplicito (lib/metadata.ts) perdeva locale,
  // nome del sito e tipo, presenti solo nel blocco della home.
  await visit(page, '/it/routes')
  const href = await page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessun percorso da aprire').toBeTruthy()

  await visit(page, href!)
  expect(await ogContent(page, 'og:site_name')).toBe('Lelettrica')
  expect(await ogContent(page, 'og:locale')).toBe('it_IT')
  expect(await ogContent(page, 'og:type')).toBe('website')
  // E l'url deve restare quello del percorso, non tornare a quello della home.
  expect(await ogContent(page, 'og:url')).toContain(href!)
})

test('og:image punta a un url assoluto', async ({ page }) => {
  await visit(page, '/it/bikes')
  const image = await ogContent(page, 'og:image')
  expect(image, 'og:image mancante').toBeTruthy()
  expect(image).toMatch(/^https?:\/\//)
})
