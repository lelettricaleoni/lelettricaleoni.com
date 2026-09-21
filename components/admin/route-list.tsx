'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { reorderRoutesAction } from '@/lib/actions/routes'
import { RouteListItem } from './route-list-item'
import type { Route } from '@/lib/db'

interface RouteRow {
  route: Route
  name: string
}

function SortableRouteRow({ row }: { row: RouteRow }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: row.route.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="text-muted-foreground hover:text-foreground cursor-grab shrink-0 p-2"
        aria-label="Drag to reorder"
      >
        <GripVertical size={16} />
      </button>
      <div className="flex-1 min-w-0">
        <RouteListItem route={row.route} name={row.name} />
      </div>
    </div>
  )
}

export function RouteList({ initialRoutes }: { initialRoutes: RouteRow[] }) {
  const [rows, setRows] = useState(initialRoutes)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: { active: { id: string }; over: { id: string } | null }) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = rows.findIndex((r) => r.route.id === active.id)
    const newIndex = rows.findIndex((r) => r.route.id === over.id)
    const reordered = arrayMove(rows, oldIndex, newIndex)
    setRows(reordered)

    reorderRoutesAction(reordered.map((r) => r.route.id)).catch(() => {
      toast.error('Could not save the new order')
    })
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd as Parameters<typeof DndContext>[0]['onDragEnd']}>
      <SortableContext items={rows.map((r) => r.route.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {rows.map((row) => (
            <SortableRouteRow key={row.route.id} row={row} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
