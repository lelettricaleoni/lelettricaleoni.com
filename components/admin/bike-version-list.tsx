'use client'
import { useState, useTransition } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  createBikeVersionAction, updateBikeVersionAction, deleteBikeVersionAction,
} from '@/lib/actions/bike-options'
import type { BikeVersion } from '@/lib/db'

export function BikeVersionList({ versions }: { versions: BikeVersion[] }) {
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [newName, setNewName] = useState('')

  function startEdit(version: BikeVersion) {
    setEditingId(version.id)
    setDraftName(version.name)
  }

  function saveEdit(id: string, displayOrder: number) {
    startTransition(async () => {
      await updateBikeVersionAction(id, draftName, displayOrder)
      setEditingId(null)
      toast.success('Version updated')
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteBikeVersionAction(id)
        toast.success('Version deleted')
      } catch {
        toast.error('This version is still used by a model or a bike in the shop')
      }
    })
  }

  function handleCreate() {
    if (!newName.trim()) return
    startTransition(async () => {
      await createBikeVersionAction(newName.trim(), versions.length)
      setNewName('')
      toast.success('Version added')
    })
  }

  return (
    <div className="space-y-2 max-w-md">
      {versions.map((version) => (
        <div key={version.id} className="flex items-center gap-2 p-2 bg-card border rounded-lg">
          {editingId === version.id ? (
            <>
              <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} className="h-8" />
              <Button size="icon" variant="ghost" disabled={isPending} onClick={() => saveEdit(version.id, version.displayOrder)}>
                <Check size={14} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <X size={14} />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{version.name}</span>
              <Button size="icon" variant="ghost" onClick={() => startEdit(version)}>
                <Pencil size={14} />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(version.id)}>
                <Trash2 size={14} />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <Input
          placeholder="New version (e.g. Bambini)"
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
