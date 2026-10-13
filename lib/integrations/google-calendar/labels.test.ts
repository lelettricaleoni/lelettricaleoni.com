import { describe, expect, it } from 'vitest'
import { MAINTENANCE_COLOR } from '@/lib/bike-colors'
import { MAINTENANCE_LABEL_ID, MAX_LABELS, mergeLabels, wantedLabels, type CalendarLabel } from './labels'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('wantedLabels', () => {
  it('is one label per model with a colour, named like the model, and the maintenance one', () => {
    expect(wantedLabels([{ id: A, name: 'Flyer Uproc 2', color: '#039be5' }, { id: B, name: 'Gravel', color: null }])).toEqual([
      { id: A, backgroundColor: '#039be5', name: 'Flyer Uproc 2' },
      { id: MAINTENANCE_LABEL_ID, backgroundColor: MAINTENANCE_COLOR, name: 'Maintenance' },
    ])
  })

  it('writes the colour in lowercase and keeps a long name within fifty characters', () => {
    const [label] = wantedLabels([{ id: A, name: 'x'.repeat(80), color: '#8E24AA' }])
    expect(label.backgroundColor).toBe('#8e24aa')
    expect(label.name).toHaveLength(50)
  })

  it('gives an empty name a name', () => {
    expect(wantedLabels([{ id: A, name: '  ', color: '#039be5' }])[0].name).toBe('Untitled')
  })
})

describe('mergeLabels', () => {
  const mine = (color = '#039be5', name = 'Uproc'): CalendarLabel => ({ id: A, backgroundColor: color, name })
  const hers = (n: number): CalendarLabel => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, backgroundColor: '#112233', name: `By hand ${n}` })

  it('adds the labels the calendar does not have, after the ones it has', () => {
    const merged = mergeLabels([hers(1)], [mine()])
    expect(merged).toEqual({ labels: [hers(1), mine()], changed: true, tooMany: false })
  })

  it('corrects the colour or the name of a label of ours, in place, and touches nothing else', () => {
    const merged = mergeLabels([hers(1), mine('#000000', 'Old name'), hers(2)], [mine('#e91e63', 'New name')])
    expect(merged.labels).toEqual([hers(1), mine('#e91e63', 'New name'), hers(2)])
    expect(merged.changed).toBe(true)
  })

  it('says nothing changed when the calendar already has them (the case of the colour does not matter)', () => {
    const merged = mergeLabels([hers(1), mine('#039BE5')], [mine('#039be5')])
    expect(merged.changed).toBe(false)
    expect(merged.labels).toHaveLength(2)
  })

  it('does not change the list it was given', () => {
    const existing = [hers(1)]
    mergeLabels(existing, [mine()])
    expect(existing).toEqual([hers(1)])
  })

  it('writes nothing when the calendar would pass the limit of labels', () => {
    const existing = Array.from({ length: MAX_LABELS }, (_, n) => hers(n))
    const merged = mergeLabels(existing, [mine()])
    expect(merged).toEqual({ labels: existing, changed: false, tooMany: true })
  })
})
