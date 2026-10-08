'use client'
import { useState, useTransition } from 'react'
import { LuPlus, LuPencil, LuTrash2, LuCheck, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { rethrowIfStaleAction } from '@/lib/stale-action'
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
      } catch (error) {
        rethrowIfStaleAction(error)
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
                <LuCheck size={14} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                <LuX size={14} />
              </Button>
            </>
          ) : (
            <>
              <span className="flex-1 text-sm">{version.name}</span>
              <Button size="icon" variant="ghost" onClick={() => startEdit(version)}>
                <LuPencil size={14} />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" disabled={isPending} onClick={() => handleDelete(version.id)}>
                <LuTrash2 size={14} />
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
          <LuPlus size={14} />
        </Button>
      </div>
    </div>
  )
}
