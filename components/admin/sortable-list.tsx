'use client'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter,
  KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

export interface SortableItem {
  id: string
  node: ReactNode
}

function SortableRow({ item }: { item: SortableItem }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id })

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
      <div className="flex-1 min-w-0">{item.node}</div>
    </div>
  )
}

export function SortableList({
  items, onReorder, errorMessage = 'Could not save the new order',
}: {
  items: SortableItem[]
  onReorder: (orderedIds: string[]) => Promise<void>
  errorMessage?: string
}) {
  const [rows, setRows] = useState(items)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = rows.findIndex((r) => r.id === active.id)
    const newIndex = rows.findIndex((r) => r.id === over.id)
    const reordered = arrayMove(rows, oldIndex, newIndex)
    setRows(reordered)

    onReorder(reordered.map((r) => r.id)).catch(() => toast.error(errorMessage))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {rows.map((item) => <SortableRow key={item.id} item={item} />)}
        </div>
      </SortableContext>
    </DndContext>
  )
}
