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

test('il dettaglio di un percorso ha titolo e descrizione fatti per la ricerca', async ({ page }) => {
  // Prima la descrizione era il testo del percorso tagliato a 155 caratteri, a
  // metà parola e uguale nella forma per tutti. Ora comincia con le cifre del
  // percorso (route-seo.ts) e finisce a fine frase o a fine parola.
  await visit(page, '/it/routes')
  const href = await page.locator('a[href*="/routes/"]').filter({ has: page.locator('h3') })
    .first().getAttribute('href')
  expect(href, 'nessun percorso da aprire').toBeTruthy()
  await visit(page, href!)

  await expect(page).toHaveTitle(/percorso in e-bike da Dro \| Lelettrica$/)
  const description = await page.locator('meta[name="description"]').first().getAttribute('content')
  expect(description, 'description mancante').toBeTruthy()
  // Le cifre (km o metri di dislivello) aprono la descrizione, qualunque delle due manchi.
  expect(description).toMatch(/^(Distanza [\d.,]+ km|Dislivello [\d.,]+ m)/)
  expect(description!.length, 'description più lunga di ciò che Google mostra').toBeLessThanOrEqual(155)
})

test('og:image punta a un url assoluto', async ({ page }) => {
  await visit(page, '/it/bikes')
  const image = await ogContent(page, 'og:image')
  expect(image, 'og:image mancante').toBeTruthy()
  expect(image).toMatch(/^https?:\/\//)
})

test("l'immagine di default per i social esiste davvero", async ({ request }) => {
  // Le pagine dichiarano /opengraph-image come og:image, e il test qui sopra
  // controlla solo che l'URL sia scritto bene. Per undici giorni (dal
  // 2026-09-14) quella rotta ha risposto 500, perché leggeva il logo da
  // public/ e su Vercel quei file non sono nel pacchetto della funzione:
  // nessuna anteprima mostrava un'immagine e nessun test se ne accorgeva.
  // Si scarica dal sito sotto test, non dall'URL dichiarato, che punta sempre
  // alla produzione.
  const response = await request.get('/opengraph-image')
  expect(response.status(), "/opengraph-image non risponde").toBe(200)
  expect(response.headers()['content-type']).toContain('image/png')
  expect((await response.body()).length, 'immagine troppo piccola per essere vera')
    .toBeGreaterThan(5_000)
})

test('le liste dicono cosa sono e dove, nel titolo della scheda', async ({ page }) => {
  // Prima: "Le nostre bici | Lelettrica" e "Percorsi consigliati | Lelettrica",
  // che non dicono né cosa né dove a chi le vede tra i risultati di Google.
  await visit(page, '/it/bikes')
  expect(await page.title()).toMatch(/noleggio.*Dro/i)

  await visit(page, '/it/routes')
  expect(await page.title()).toMatch(/e-bike.*Dro/i)
})

test("l'H1 della home dice cosa siamo e dove", async ({ page }) => {
  // Prima era solo "Lelettrica".
  await visit(page, '/it')
  const h1 = await page.locator('h1').first().innerText()
  expect(h1).toMatch(/e-bike/i)
  expect(h1).toMatch(/Dro/)
})

test('il catalogo nei dati strutturati della home viene dal database, e non vende auto', async ({ page }) => {
  await visit(page, '/it')
  const readBlocks = () =>
    page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((el) => el.textContent ?? ''))

  // Il catalogo arriva in streaming, fuori dal percorso critico della home
  // (components/home-catalog-jsonld-script.tsx): si aspetta che compaia.
  await expect
    .poll(async () => (await readBlocks()).some((b) => b.includes('hasOfferCatalog')), {
      message: 'nessun blocco con hasOfferCatalog nella home',
    })
    .toBe(true)

  const blocks = await readBlocks()
  const withCatalog = blocks.map((b) => JSON.parse(b)).find((ld) => ld.hasOfferCatalog)

  const products = withCatalog.hasOfferCatalog.itemListElement
  expect(products.length, 'catalogo vuoto').toBeGreaterThan(0)
  for (const product of products) {
    // Google scarta un Product senza offers/review/aggregateRating (7 errori in Search Console).
    expect(product['@type']).toBe('Product')
    expect(product.offers?.url).toContain('/it/bikes/')
    expect(product.offers?.price, `prezzo mancante per ${product.name}`).toBeGreaterThan(0)
    // Con le offerte a posto Google ha chiesto l'immagine: altri 7 errori (2026-10-05).
    expect(product.image, `immagine mancante per ${product.name}`).toMatch(/\.(share\.jpg|jpe?g|png|webp)$/)
  }
  // Scritto a mano, il catalogo tipava le bici come RentalCar.
  expect(blocks.join('')).not.toContain('RentalCar')
})
