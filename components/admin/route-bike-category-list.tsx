'use client'
import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  createRouteBikeCategoryAction, updateRouteBikeCategoryAction, deleteRouteBikeCategoryAction,
} from '@/lib/actions/bike-options'
import type { RouteBikeCategory } from '@/lib/db'

export function RouteBikeCategoryList({ categories }: { categories: RouteBikeCategory[] }) {
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')

  function startEdit(category: RouteBikeCategory) {
    setEditingId(category.id)
    setDraftName(category.name)
  }

  function saveEdit(id: string, displayOrder: number) {
    startTransition(async () => {
      await updateRouteBikeCategoryAction(id, draftName, displayOrder)
      setEditingId(null)
      toast.success('Category updated')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        const { error } = await deleteRouteBikeCategoryAction(id)
        if (error) {
          toast.error(error)
          return
        }
        toast.success('Category deleted')
      } catch {
        toast.error('This category is still linked to a bike category')
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createRouteBikeCategoryAction(newName.trim(), categories.length)
      setNewName('')
      toast.success('Category added')
    })
  }

  return (
    <div className="space-y-2 max-w-md">
      {categories.map((category) => (
        <div key={category.id} className="flex items-center gap-2 p-2 bg-card border rounded-lg">
          {editingId === category.id ? (
            <>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8" />
              <Button size="icon" variant="ghost" disabled={isPending} onClick={() => saveEdit(category.id, category.displayOrder)}>
                <Check size={14} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{category.name}</span>
              <Button size="icon" variant="ghost" onClick={() => startEdit(category)}>
                <Pencil size={14} />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(category.id)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Input
          placeholder="New category (e.g. eMTB)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="h-8"
        />
        <Button size="icon" variant="outline" disabled={isPending} onClick={handleCreate}>
          <Plus size={14} />
        </Button>
      </div>
    </div>
  )
}
