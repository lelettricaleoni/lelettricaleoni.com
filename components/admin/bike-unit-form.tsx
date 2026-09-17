'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { createBikeUnitAction } from '@/lib/actions/bike-units'
import type { BikeModel, BikeSize, BikeVersion } from '@/lib/db'

interface ModelOption {
  model: BikeModel
  name: string
  allowedSizes: BikeSize[]
  allowedVersions: BikeVersion[]
}

export function BikeUnitForm({ models }: { models: ModelOption[] }) {
  const [isPending, startTransition] = useTransition()
  const [modelId, setModelId] = useState('')
  const [sizeId, setSizeId] = useState('')
  const [versionId, setVersionId] = useState('')

  const selected = models.find((m) => m.model.id === modelId)

  function handleModelChange(id: string) {
    setModelId(id)
    setSizeId('')
    setVersionId('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!modelId || !sizeId || !versionId) return
    startTransition(async () => {
      await createBikeUnitAction(modelId, sizeId, versionId)
      toast.success('Bike added to the shop')
      setModelId('')
      setSizeId('')
      setVersionId('')
    })
  }

  const noOptions = selected && (selected.allowedSizes.length === 0 || selected.allowedVersions.length === 0)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md p-4 bg-card border rounded-lg">
      <div className="space-y-1">
        <Label htmlFor="unit-model">Model *</Label>
        <Select value={modelId} onValueChange={handleModelChange}>
          <SelectTrigger id="unit-model"><SelectValue placeholder="Choose a model" /></SelectTrigger>
          <SelectContent>
            {models.map((m) => <SelectItem key={m.model.id} value={m.model.id}>{m.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {noOptions && (
        <p className="text-xs text-destructive">
          This model has no sizes or versions configured yet — add them in the model&apos;s
          edit page before adding a physical bike.
        </p>
      )}

      {selected && !noOptions && (
        <>
          <div className="space-y-1">
            <Label htmlFor="unit-size">Size *</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger id="unit-size"><SelectValue placeholder="Choose a size" /></SelectTrigger>
              <SelectContent>
                {selected.allowedSizes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="unit-version">Version *</Label>
            <Select value={versionId} onValueChange={setVersionId}>
              <SelectTrigger id="unit-version"><SelectValue placeholder="Choose a version" /></SelectTrigger>
              <SelectContent>
                {selected.allowedVersions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <Button type="submit" disabled={isPending || !modelId || !sizeId || !versionId}>
        Add bike
      </Button>
    </form>
  )
}
