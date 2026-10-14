'use client'
import { useState, useTransition } from 'react'
import { LuPencil, LuTrash2, LuPlus } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { rethrowIfStaleAction } from '@/lib/stale-action'
import {
  createBikeCategoryAction, updateBikeCategoryAction, deleteBikeCategoryAction, reorderBikeCategoriesAction,
  type BikeCategoryInput,
} from '@/lib/actions/bike-options'
import { SortableList } from './sortable-list'
import { BikeCategoryForm } from './bike-category-form'
import type { BikeCategory, RouteBikeCategory } from '@/lib/db'

export function BikeCategoryList({
  categories, routeCategories,
}: { categories: BikeCategory[]; routeCategories: RouteBikeCategory[] }) {
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState<BikeCategory | 'new' | null>(null)

  function handleSubmit(input: BikeCategoryInput) {
    startTransition(async () => {
      if (editing && editing !== 'new') {
        await updateBikeCategoryAction(editing.id, input)
        toast.success('Category updated')
      } else {
        await createBikeCategoryAction(input)
        toast.success('Category created')
      }
      setEditing(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBikeCategoryAction(id)
        toast.success('Category deleted')
      } catch (error) {
        rethrowIfStaleAction(error)
        toast.error('This category is still used by a model')
      }
    })
  }

  if (editing) {
    return (
      <BikeCategoryForm
        category={editing === 'new' ? undefined : editing}
        routeCategories={routeCategories}
        onSubmit={handleSubmit}
        onCancel={() => setEditing(null)}
      />
    )
  }

  // The list copies its rows into its own state once, so what the server sends after an edit, a new category or a delete would never reach it:
  // a key that changes with what the rows show starts it over with them. A drag alone does not change it.
  const contentKey = categories.map((cat) => `${cat.id}:${cat.name}:${cat.pricingMode}:${cat.maxRentalDays}:${cat.day1Price}`).join('|')

  return (
    <div className="space-y-4 max-w-2xl">
      {categories.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Drag to reorder. The categories are shown in this order everywhere (the bikes page, when booking, the models in the panel), and the
          models of each category in the order set in Bike models.
        </p>
      )}
      <SortableList
        key={contentKey}
        items={categories.map((cat) => ({
          id: cat.id,
          node: (
            <div className="flex items-center justify-between p-3 bg-card border rounded-lg">
              <div className="space-y-1">
                <p className="font-medium text-sm">{cat.name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{cat.pricingMode === 'table' ? 'Day-by-day' : 'Linear'}</Badge>
                  <span>max {cat.maxRentalDays} days</span>
                  <span>day 1: {cat.day1Price}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEditing(cat)}>
                  <LuPencil size={14} />
                </Button>
                <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(cat.id)}>
                  <LuTrash2 size={14} />
                </Button>
              </div>
            </div>
          ),
        }))}
        onReorder={reorderBikeCategoriesAction}
      />

      <Button variant="outline" onClick={() => setEditing('new')} className="gap-1">
        <LuPlus size={14} /> New category
      </Button>
    </div>
  )
}
