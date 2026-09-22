import { SortableList } from './sortable-list'
import { reorderRoutesAction } from '@/lib/actions/routes'
import { RouteListItem } from './route-list-item'
import type { Route } from '@/lib/db'

interface RouteRow {
  route: Route
  name: string
}

export function RouteList({ initialRoutes }: { initialRoutes: RouteRow[] }) {
  return (
    <SortableList
      items={initialRoutes.map(({ route, name }) => ({
        id: route.id,
        node: <RouteListItem route={route} name={name} />,
      }))}
      onReorder={reorderRoutesAction}
    />
  )
}
