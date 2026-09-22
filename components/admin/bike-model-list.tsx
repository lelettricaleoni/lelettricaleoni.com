import { SortableList } from './sortable-list'
import { reorderBikeModelsAction } from '@/lib/actions/bike-models'
import { BikeModelListItem } from './bike-model-list-item'
import type { BikeModel } from '@/lib/db'

interface BikeModelRow {
  model: BikeModel
  name: string
}

export function BikeModelList({ initialModels }: { initialModels: BikeModelRow[] }) {
  return (
    <SortableList
      items={initialModels.map(({ model, name }) => ({
        id: model.id,
        node: <BikeModelListItem model={model} name={name} />,
      }))}
      onReorder={reorderBikeModelsAction}
    />
  )
}
