import { test, expect } from '@playwright/test'

/**
 * The 3D map draws at the screen's real pixel ratio, and follows it.
 *
 * Cesium's default draws at one pixel per CSS pixel times `resolutionScale`, and the
 * flyover set `resolutionScale = devicePixelRatio` once, at start. After a browser
 * zoom, or moving the window to a sharper screen, the canvas kept its old pixel
 * count and was stretched: the track line and the place names came out jagged
 * (seen 2026-10-07). The test changes the ratio AFTER the map is up, which is how
 * zooming looks to the page, and asks for the canvas to follow.
 *
 * Phone width only, like elevation-chart.spec.ts: the software-rendered 3D canvas
 * is too slow on CI at wider viewports. Chromium only (it uses a DevTools session).
 */
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'telefono', 'il flyover 3D in software è troppo lento a viewport larghi')
  testInfo.setTimeout(90_000)
})

test('il canvas della mappa 3D segue il rapporto di pixel dello schermo dopo uno zoom', async ({ page }) => {
  await page.goto('/it/routes', { waitUntil: 'domcontentloaded' })
  await page.locator('a[href^="/it/routes/"]').first().waitFor({ timeout: 15_000 })
  const hrefs = await page.locator('a[href^="/it/routes/"]').evaluateAll((els) =>
    [...new Set(els.map((el) => el.getAttribute('href')!))]
  )

  const canvas = page.locator('.cesium-widget canvas').first()
  let found = false
  for (const href of hrefs) {
    await page.goto(href, { waitUntil: 'domcontentloaded' })
    found = await canvas.waitFor({ state: 'attached', timeout: 20_000 }).then(() => true, () => false)
    if (found) break
  }
  test.skip(!found, 'nessun percorso con traccia GPX nei dati di questo ambiente')

  const ratio = () => canvas.evaluate((el: HTMLCanvasElement) => el.width / el.clientWidth)
  // Let the map settle at the starting ratio.
  await expect.poll(ratio, { message: 'la mappa non si è disegnata' }).toBeGreaterThan(0)

  const viewport = page.viewportSize()!
  const cdp = await page.context().newCDPSession(page)
  for (const deviceScaleFactor of [2, 1.5]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: viewport.width, height: viewport.height, deviceScaleFactor, mobile: false,
    })
    await expect
      .poll(ratio, { message: `il canvas non segue il rapporto di pixel ${deviceScaleFactor}` })
      .toBeCloseTo(deviceScaleFactor, 1)
  }
})
