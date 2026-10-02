import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// The list calls a Server Action that talks to the database: nothing of that runs in a static render.
vi.mock('@/lib/actions/bike-units', () => ({ deleteBikeUnitAction: vi.fn() }))

import { BikeUnitList } from './bike-unit-list'
import type { BikeUnit } from '@/lib/db'

const row = (id: string, modelName: string) => ({
  unit: { id } as BikeUnit, modelName, sizeName: 'M', versionName: 'Alu',
})

function render(maintenance: Record<string, { startsOn: string; endsOn: string; active: boolean }>) {
  return renderToStaticMarkup(createElement(BikeUnitList, {
    units: [row('aaaaaaaa-0001', 'Mondraker'), row('bbbbbbbb-0002', 'Flyer')],
    maintenance,
  }))
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
})
