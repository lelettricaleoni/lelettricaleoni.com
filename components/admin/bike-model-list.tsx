import { SortableList } from './sortable-list'
import { reorderBikeModelsAction } from '@/lib/actions/bike-models'
import { BikeModelListItem } from './bike-model-list-item'
import type { BikeModel } from '@/lib/db'

interface BikeModelRow {
  model: BikeModel
  name: string
}

export function BikeModelList({ initialModels }: { initialModels: BikeModelRow[] }) {
  // SortableList copies its items into state once, so new props from the server
  // (a model hidden, a model deleted) would never reach the rows. A key that
  // changes with what the rows show makes React start the list over with them.
  // A drag alone does not change it: it reorders local state, and the ids and
  // states are the same.
  const contentKey = [...initialModels]
    .map(({ model, name }) => `${model.id}:${model.isPublished ? 1 : 0}:${name}`)
    .sort()
    .join('|')

  return (
    <SortableList
      key={contentKey}
      items={initialModels.map(({ model, name }) => ({
        id: model.id,
        node: <BikeModelListItem model={model} name={name} />,
      }))}
      onReorder={reorderBikeModelsAction}
    />
  )
}
