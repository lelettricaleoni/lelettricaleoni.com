'use client'
import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  createBikeSizeAction, updateBikeSizeAction, deleteBikeSizeAction,
} from '@/lib/actions/bike-options'
import type { BikeSize } from '@/lib/db'

export function BikeSizeList({ sizes }: { sizes: BikeSize[] }) {
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')

  function startEdit(size: BikeSize) {
    setEditingId(size.id)
    setDraftName(size.name)
  }

  function saveEdit(id: string, displayOrder: number) {
    startTransition(async () => {
      await updateBikeSizeAction(id, draftName, displayOrder)
      setEditingId(null)
      toast.success('Size updated')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBikeSizeAction(id)
        toast.success('Size deleted')
      } catch {
        toast.error('This size is still used by a model or a bike in the shop')
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createBikeSizeAction(newName.trim(), sizes.length)
      setNewName('')
      toast.success('Size added')
    })
  }

  return (
    <div className="space-y-2 max-w-md">
      {sizes.map((size) => (
        <div key={size.id} className="flex items-center gap-2 p-2 bg-card border rounded-lg">
          {editingId === size.id ? (
            <>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8" />
              <Button size="icon" variant="ghost" disabled={isPending} onClick={() => saveEdit(size.id, size.displayOrder)}>
                <Check size={14} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{size.name}</span>
              <Button size="icon" variant="ghost" onClick={() => startEdit(size)}>
                <Pencil size={14} />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(size.id)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Input
          placeholder="New size (e.g. XL)"
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
