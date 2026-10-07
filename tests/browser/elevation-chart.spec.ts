import { test, expect, type Page } from '@playwright/test'

/**
 * Il profilo altimetrico nel flyover (components/route-elevation-chart.tsx).
 *
 * Recharts 3 disegna il grafico dopo il primo effetto del componente, e il cursore
 * si appoggia ai bordi del grafico misurati dal DOM: se la misura parte a vuoto e
 * non si ripete, il cursore non compare, il trascinamento non fa niente e il volo
 * automatico non muove il grafico. Poi Recharts 3 accende `accessibilityLayer`, che
 * rende il grafico focalizzabile: un tocco mette il focus su un suo livello interno
 * e il browser gli disegna attorno un riquadro scuro. Entrambi visti da telefono
 * (2026-10-07), nessuno dei due era coperto da un test.
 */

async function routeWithProfile(page: Page) {
  await page.goto('/it/routes', { waitUntil: 'domcontentloaded' })
  // La lista arriva in streaming: senza questa attesa si leggono zero link.
  await page.locator('a[href^="/it/routes/"]').first().waitFor({ timeout: 15_000 })
  const hrefs = await page.locator('a[href^="/it/routes/"]').evaluateAll((els) =>
    [...new Set(els.map((el) => el.getAttribute('href')!))]
  )
  for (const href of hrefs) {
    await page.goto(href, { waitUntil: 'domcontentloaded' })
    const toggle = page.getByRole('button', { name: 'Profilo altimetrico' })
    // `isVisible` non aspetta: il pulsante compare quando il flyover ha caricato i punti.
    const hasProfile = await toggle.waitFor({ state: 'visible', timeout: 10_000 }).then(() => true, () => false)
    if (hasProfile) {
      await toggle.click()
      await expect(page.getByTestId('elevation-chart')).toBeVisible()
      return
    }
  }
  test.skip(true, 'nessun percorso con traccia GPX nei dati di questo ambiente')
}

test('il cursore compare al primo tocco sul grafico, senza dover ridimensionare', async ({ page }) => {
  await routeWithProfile(page)
  const chart = page.getByTestId('elevation-chart')
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2)
  await page.mouse.down()
  const cursor = page.getByTestId('elevation-cursor')
  await expect(cursor, 'il cursore non è comparso').toHaveCSS('display', 'block')
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 5 })
  const x80 = await cursor.evaluate((el) => (el as HTMLElement).style.transform)
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 5 })
  await expect
    .poll(() => cursor.evaluate((el) => (el as HTMLElement).style.transform), { message: 'il cursore non segue il dito' })
    .not.toBe(x80)
  await page.mouse.up()
})

test('toccare il grafico non disegna nessun riquadro di focus', async ({ page }) => {
  await routeWithProfile(page)
  const chart = page.getByTestId('elevation-chart')
  await chart.scrollIntoViewIfNeeded()
  const box = (await chart.boundingBox())!

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2)

  // Il grafico è un cursore da trascinare, non un controllo da tastiera.
  await expect(chart.locator('[tabindex="0"]'), 'il grafico è focalizzabile').toHaveCount(0)

  // Quello che si vede è il contorno dell'elemento che ha preso il focus: i livelli
  // interni di Recharts 3 lo prendono a un clic e hanno un `outline: auto` scuro.
  const outline = await chart.evaluate((el) => {
    const active = document.activeElement
    if (!active || !el.contains(active)) return 'none'
    const cs = getComputedStyle(active)
    return cs.outlineStyle === 'none' || cs.outlineWidth === '0px' ? 'none' : `${cs.outlineStyle} ${cs.outlineWidth}`
  })
  expect(outline, 'un elemento del grafico mostra un riquadro di focus').toBe('none')
})
