import { describe, it, expect } from 'vitest'
import { onlyChoice, sizesOf, versionsOf, type RentalOption } from './rental-options'

const options: RentalOption[] = [
  {
    modelId: 'm1', modelName: 'Mondraker',
    sizes: [
      { id: 's-s', name: 'S', versions: [{ id: 'v-x', name: 'Alu' }, { id: 'v-y', name: 'Carbon' }] },
      { id: 's-m', name: 'M', versions: [{ id: 'v-x', name: 'Alu' }] },
    ],
  },
  { modelId: 'm2', modelName: 'Flyer', sizes: [{ id: 's-l', name: 'L', versions: [{ id: 'v-z', name: 'Std' }] }] },
]

describe('the cascade of choices in the rental form', () => {
  it('offers the sizes of the chosen model', () => {
    expect(sizesOf(options, 'm1').map((s) => s.id)).toEqual(['s-s', 's-m'])
    expect(sizesOf(options, 'm2').map((s) => s.id)).toEqual(['s-l'])
  })

  it('offers the versions that exist in the chosen size, not every version of the model', () => {
    expect(versionsOf(options, 'm1', 's-s').map((v) => v.id)).toEqual(['v-x', 'v-y'])
    expect(versionsOf(options, 'm1', 's-m').map((v) => v.id)).toEqual(['v-x'])
  })

  it('offers nothing for a model, or a size, that is not there', () => {
    expect(sizesOf(options, 'nope')).toEqual([])
    expect(versionsOf(options, 'm1', 'nope')).toEqual([])
    expect(versionsOf(options, 'nope', 's-s')).toEqual([])
    expect(sizesOf(options, '')).toEqual([])
  })

  it('picks for the person when there is only one choice, and never guesses otherwise', () => {
    expect(onlyChoice([{ id: 's-l' }])).toBe('s-l')
    expect(onlyChoice([{ id: 's-s' }, { id: 's-m' }])).toBe('')
    expect(onlyChoice([])).toBe('')
  })
})
