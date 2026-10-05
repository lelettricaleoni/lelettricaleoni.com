export interface GroupableBike {
  categoryId: string
  categoryName: string
  modelId: string
  modelName: string
}

export interface ModelGroup<T> { modelId: string; modelName: string; items: T[] }
export interface CategoryGroup<T> { categoryId: string; categoryName: string; models: ModelGroup<T>[] }

/**
 * Category, then model, then bike: for the Shop list and the bookings calendar. The order is the one
 * the query gave (categories by their display order, models by name, bikes by size and version):
 * this only puts neighbours together, it never sorts.
 */
export function groupByCategoryAndModel<T extends GroupableBike>(bikes: T[]): CategoryGroup<T>[] {
  const categories: CategoryGroup<T>[] = []
  for (const bike of bikes) {
    let category = categories.find((group) => group.categoryId === bike.categoryId)
    if (!category) {
      category = { categoryId: bike.categoryId, categoryName: bike.categoryName, models: [] }
      categories.push(category)
    }
    let model = category.models.find((group) => group.modelId === bike.modelId)
    if (!model) {
      model = { modelId: bike.modelId, modelName: bike.modelName, items: [] }
      category.models.push(model)
    }
    model.items.push(bike)
  }
  return categories
}
