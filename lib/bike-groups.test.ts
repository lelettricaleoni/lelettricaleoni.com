import { describe, expect, it } from 'vitest'
import { groupByCategoryAndModel } from './bike-groups'

const bike = (id: string, categoryId: string, categoryName: string, modelId: string, modelName: string) =>
  ({ id, categoryId, categoryName, modelId, modelName })

describe('groupByCategoryAndModel', () => {
  it('groups bikes under their category and, inside it, their model', () => {
    const groups = groupByCategoryAndModel([
      bike('1', 'c-ebike', 'E-bike', 'm-flyer', 'Flyer'),
      bike('2', 'c-ebike', 'E-bike', 'm-flyer', 'Flyer'),
      bike('3', 'c-ebike', 'E-bike', 'm-mond', 'Mondraker'),
      bike('4', 'c-city', 'City bike', 'm-classic', 'Classica'),
    ])
    expect(groups.map((g) => [g.categoryName, g.models.map((m) => [m.modelName, m.items.map((i) => i.id)])])).toEqual([
      ['E-bike', [['Flyer', ['1', '2']], ['Mondraker', ['3']]]],
      ['City bike', [['Classica', ['4']]]],
    ])
  })

  it('keeps the order it is given: the query decides the order of categories, models and bikes', () => {
    const groups = groupByCategoryAndModel([
      bike('1', 'c-b', 'B', 'm-z', 'Zeta'),
      bike('2', 'c-a', 'A', 'm-y', 'Yota'),
      bike('3', 'c-b', 'B', 'm-x', 'Xi'),
    ])
    expect(groups.map((g) => g.categoryName)).toEqual(['B', 'A'])
    expect(groups[0].models.map((m) => m.modelName)).toEqual(['Zeta', 'Xi'])
  })

  it('tells two models with the same name apart, and two categories with the same name', () => {
    const groups = groupByCategoryAndModel([
      bike('1', 'c1', 'E-bike', 'm1', 'Flyer'),
      bike('2', 'c1', 'E-bike', 'm2', 'Flyer'),
      bike('3', 'c2', 'E-bike', 'm3', 'Flyer'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0].models).toHaveLength(2)
  })

  it('returns nothing for no bikes', () => {
    expect(groupByCategoryAndModel([])).toEqual([])
  })
})
