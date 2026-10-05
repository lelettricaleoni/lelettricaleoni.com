import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The component reads the router and opens a Realtime channel: neither exists outside the browser.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/components/admin/use-reservations-realtime', () => ({ useReservationsRealtime: vi.fn() }))

import { BookingView } from './booking-view'
import type { GridUnit } from '@/lib/reservations'

const unit = (
  id: string, modelName: string, reservations: GridUnit['reservations'] = [], retiredOn: string | null = null,
  categoryName = 'E-bike',
): GridUnit => ({
  id, shortId: id.slice(0, 8), categoryId: `cat-${categoryName}`, categoryName, modelId: `model-${modelName}`, modelName,
  sizeId: 'size-m', sizeName: 'M', versionId: 'version-alu', versionName: 'Alu', retiredOn, reservations,
})

const rental = { id: 'r1', kind: 'counter_rental' as const, startsOn: '2031-07-10', endsOn: '2031-07-13', label: 'Mario Rossi', customer: { id: 'c1', firstName: 'Mario', lastName: 'Rossi', email: null, phone: null, notes: null }, amountCents: 4500 }
const maintenance = { id: 'm1', kind: 'maintenance' as const, startsOn: '2031-07-20', endsOn: '2031-07-22', label: 'chain', customer: null, amountCents: null }

function render(units: GridUnit[], today = '2031-07-15') {
  return renderToStaticMarkup(createElement(BookingView, { month: '2031-07', today, units, models: [] }))
}

describe('BookingView', () => {
  it('shows the month and links to the previous and the next one', () => {
    const html = render([unit('aaaaaaaa-0000', 'Mondraker')])
    expect(html).toContain('July 2031')
    expect(html).toContain('href="/manage/bookings?month=2031-06"')
    expect(html).toContain('href="/manage/bookings?month=2031-08"')
  })

  it('has a header cell for every day of the month, and no more', () => {
    const html = render([unit('aaaaaaaa-0000', 'Mondraker')])
    expect(html).toContain('>31<')
    expect(html).not.toContain('>32<')
  })

  it('groups bikes under their model: one heading per model, not per bike', () => {
    const html = render([unit('aaaaaaaa-0001', 'Mondraker'), unit('aaaaaaaa-0002', 'Mondraker'), unit('bbbbbbbb-0003', 'Flyer')])
    expect(html.split('>Mondraker<')).toHaveLength(2)
    expect(html.split('>Flyer<')).toHaveLength(2)
  })

  it('places a reservation on its columns and shows its name', () => {
    const html = render([unit('aaaaaaaa-0000', 'Mondraker', [rental])])
    expect(html).toContain('grid-column:10 / span 3')
    expect(html).toContain('Rossi')
    expect(html).toContain('bg-[#366DA1]')
  })

  it('draws maintenance in a different colour from a rental', () => {
    const html = render([unit('aaaaaaaa-0000', 'Mondraker', [maintenance])])
    expect(html).toContain('bg-amber-300')
  })

  it('squares the edge of a reservation that continues from the previous month', () => {
    const clipped = { ...rental, startsOn: '2031-06-28', endsOn: '2031-07-03' }
    const html = render([unit('aaaaaaaa-0000', 'Mondraker', [clipped])])
    expect(html).toContain('rounded-l-none')
    expect(html).toContain('grid-column:1 / span 2')
  })

  it('highlights today only when it falls in the month shown', () => {
    const units = [unit('aaaaaaaa-0000', 'Mondraker')]
    expect(render(units, '2031-07-15').split('bg-[#366DA1]/15')).toHaveLength(2)
    expect(render(units, '2031-09-15').split('bg-[#366DA1]/15')).toHaveLength(1)
  })

  it('does not size the grid by its content: a long name in a one-day block must not widen every day', () => {
    // `min-w-max` made the grid as wide as its widest text, and with 1fr columns that widened ALL
    // the days at once (a long customer name turned each day into ~170px of horizontal scroll).
    // The grid fills the space and has a fixed least width: label column plus a least width per day.
    const html = render([unit('aaaaaaaa-0000', 'Mondraker', [rental])])
    expect(html).not.toContain('min-w-max')
    expect(html).toContain('min-width:calc(11rem + 31 * 5.5rem)')
  })

  it('keeps the model name in view while the grid scrolls sideways: the row labels do not say it', () => {
    // The row label is only "size · version"; the model is the heading above its bikes. Without
    // `sticky left-0` on the heading's text it scrolled away and nobody knew which bike a row was.
    const html = render([unit('aaaaaaaa-0001', 'Mondraker'), unit('bbbbbbbb-0003', 'Flyer')])
    expect(html.match(/<span class="sticky left-0 inline-block[^"]*">(Mondraker|Flyer)<\/span>/g)).toHaveLength(2)
  })

  it('groups the bikes under their category, and the models under it', () => {
    const html = render([
      unit('aaaaaaaa-0001', 'Mondraker', [], null, 'E-bike'),
      unit('bbbbbbbb-0002', 'Flyer', [], null, 'E-bike'),
      unit('cccccccc-0003', 'Classica', [], null, 'City bike'),
    ])
    expect(html.match(/<span class="sticky left-0 inline-block[^"]*">(E-bike|City bike)<\/span>/g)).toHaveLength(2)
    expect(html.indexOf('>E-bike<')).toBeLessThan(html.indexOf('>Mondraker<'))
    expect(html.indexOf('>Flyer<')).toBeLessThan(html.indexOf('>City bike<'))
    expect(html.indexOf('>City bike<')).toBeLessThan(html.indexOf('>Classica<'))
  })

  it('has a button to add a rental on every bike, next to the one for maintenance', () => {
    const html = render([unit('aaaaaaaa-0001', 'Mondraker'), unit('aaaaaaaa-0002', 'Mondraker')])
    expect(html.split('aria-label="Add rental"')).toHaveLength(3)
    expect(html.split('aria-label="Plan maintenance"')).toHaveLength(3)
  })

  it('does not offer to rent a bike that is already retired', () => {
    const html = render([unit('aaaaaaaa-0001', 'Mondraker', [], '2031-07-10'), unit('aaaaaaaa-0002', 'Mondraker', [], '2031-09-01')], '2031-07-15')
    expect(html.split('aria-label="Add rental"')).toHaveLength(2) // only the bike retired in September
  })

  it('has a button to add a rental, also when the calendar is empty', () => {
    expect(render([unit('aaaaaaaa-0000', 'Mondraker')])).toContain('New rental')
    expect(render([])).toContain('New rental')
  })

  it('makes every reservation a button that opens its detail', () => {
    const html = render([unit('aaaaaaaa-0000', 'Mondraker', [rental, maintenance])])
    expect(html.match(/<button type="button"[^>]*title="Mario Rossi"/g)).toHaveLength(1)
    expect(html.match(/<button type="button"[^>]*title="chain"/g)).toHaveLength(1)
  })

  it('has a button to plan maintenance on every bike', () => {
    const html = render([unit('aaaaaaaa-0001', 'Mondraker'), unit('aaaaaaaa-0002', 'Mondraker')])
    expect(html.split('aria-label="Plan maintenance"')).toHaveLength(3)
  })

  it('says when a bike is retired, and only then', () => {
    expect(render([unit('aaaaaaaa-0000', 'Mondraker', [], '2031-07-20')])).toContain('Retired from 2031-07-20')
    expect(render([unit('aaaaaaaa-0000', 'Mondraker')])).not.toContain('Retired')
  })

  it('says so when the shop has no bikes yet', () => {
    expect(render([])).toContain('No bikes in the shop yet')
  })
})
