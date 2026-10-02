import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The list calls a Server Action that talks to the database: nothing of that runs in a static render.
vi.mock('@/lib/actions/bike-units', () => ({ deleteBikeUnitAction: vi.fn() }))

import { BikeUnitList } from './bike-unit-list'
import type { BikeUnit } from '@/lib/db'

const row = (id: string, modelName: string, retiredOn: string | null = null) => ({
  unit: { id, retiredOn } as BikeUnit, modelName, sizeName: 'M', versionName: 'Alu',
})

function render(
  maintenance: Record<string, { startsOn: string; endsOn: string; active: boolean }>,
  units = [row('aaaaaaaa-0001', 'Mondraker'), row('bbbbbbbb-0002', 'Flyer')],
) {
  return renderToStaticMarkup(createElement(BikeUnitList, { units, maintenance, today: '2031-07-15' }))
}

describe('BikeUnitList', () => {
  it('shows the last day included of a maintenance in progress', () => {
    const html = render({ 'aaaaaaaa-0001': { startsOn: '2031-07-10', endsOn: '2031-07-13', active: true } })
    expect(html).toContain('Maintenance until 2031-07-12')
  })

  it('shows the start of a maintenance that has not begun', () => {
    const html = render({ 'aaaaaaaa-0001': { startsOn: '2031-09-01', endsOn: '2031-09-05', active: false } })
    expect(html).toContain('Maintenance from 2031-09-01')
  })

  it('says nothing about maintenance for a bike that has none', () => {
    expect(render({})).not.toContain('Maintenance')
  })

  it('marks only the bike that is in maintenance', () => {
    const html = render({ 'bbbbbbbb-0002': { startsOn: '2031-07-10', endsOn: '2031-07-13', active: true } })
    expect(html.split('Maintenance until')).toHaveLength(2)
    expect(html.indexOf('Flyer')).toBeLessThan(html.indexOf('Maintenance until'))
  })

  it('offers to retire a bike in service, and says when a retired one stops being offered', () => {
    const html = render({}, [row('aaaaaaaa-0001', 'Mondraker'), row('bbbbbbbb-0002', 'Flyer', '2031-10-15')])
    expect(html.split('aria-label="Retire bike"')).toHaveLength(2)
    expect(html).toContain('Retired from 2031-10-15')
  })

  it('offers to bring a retired bike back, and only that one', () => {
    const html = render({}, [row('aaaaaaaa-0001', 'Mondraker'), row('bbbbbbbb-0002', 'Flyer', '2031-10-15')])
    expect(html.split('aria-label="Bring back into service"')).toHaveLength(2)
  })

  it('does not mention retirement for bikes that are all in service', () => {
    expect(render({})).not.toContain('Retired')
  })
})
