'use client'
import { useState, useTransition } from 'react'
import { Pencil, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  createBikeCategoryAction, updateBikeCategoryAction, deleteBikeCategoryAction,
  type BikeCategoryInput,
} from '@/lib/actions/bike-options'
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
      } catch {
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

  return (
    <div className="space-y-2 max-w-2xl">
      {categories.map((cat) => (
        <div key={cat.id} className="flex items-center justify-between p-3 bg-card border rounded-lg">
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
              <Pencil size={14} />
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(cat.id)}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>
      ))}

      <Button variant="outline" onClick={() => setEditing('new')} className="gap-1">
        <Plus size={14} /> New category
      </Button>
    </div>
  )
}
