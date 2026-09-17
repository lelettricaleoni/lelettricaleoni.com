'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { MediaUpload } from './media-upload'
import {
  getBikeModelPresignedUploadUrlAction, getBikeModelVideoPresignedUploadUrlAction,
  type BikeModelFormState,
} from '@/lib/actions/bike-models'
import type { BikeModel, BikeModelTranslation, Media, BikeCategory, BikeSize, BikeVersion } from '@/lib/db'

interface BikeModelFormProps {
  action: (prev: BikeModelFormState, formData: FormData) => Promise<BikeModelFormState>
  categories: BikeCategory[]
  sizes: BikeSize[]
  versions: BikeVersion[]
  model?: BikeModel
  translations?: BikeModelTranslation[]
  photos?: Media[]
  selectedSizeIds?: string[]
  selectedVersionIds?: string[]
}

export function BikeModelForm({
  action, categories, sizes, versions, model, translations, photos,
  selectedSizeIds, selectedVersionIds,
}: BikeModelFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const itTranslation = translations?.find((t) => t.locale === 'it')

  const [nameIt, setNameIt] = useState(itTranslation?.name ?? '')
  const [descriptionIt, setDescriptionIt] = useState(itTranslation?.description ?? '')
  const [categoryId, setCategoryId] = useState(model?.categoryId ?? categories[0]?.id ?? '')
  const [priceSurcharge, setPriceSurcharge] = useState(model?.priceSurcharge ?? '')
  const [batteryRange, setBatteryRange] = useState(model?.batteryRange ?? '')
  const [motor, setMotor] = useState(model?.motor ?? '')
  const [gearCount, setGearCount] = useState(model?.gearCount ?? '')
  const [sizeIds, setSizeIds] = useState<string[]>(selectedSizeIds ?? [])
  const [versionIds, setVersionIds] = useState<string[]>(selectedVersionIds ?? [])

  function toggleSize(id: string, checked: boolean) {
    setSizeIds((prev) => checked ? [...prev, id] : prev.filter((s) => s !== id))
  }

  function toggleVersion(id: string, checked: boolean) {
    setVersionIds((prev) => checked ? [...prev, id] : prev.filter((v) => v !== id))
  }

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Content (Italian)</h2>
        <p className="text-sm text-muted-foreground">EN and DE are regenerated whenever the Italian text changes.</p>

        <div className="space-y-1">
          <Label htmlFor="nameIt">Model name *</Label>
          <Input id="nameIt" name="nameIt" required value={nameIt} onChange={(e) => setNameIt(e.target.value)} />
          {state.errors?.nameIt && <p className="text-xs text-destructive">{state.errors.nameIt[0]}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="descriptionIt">Description *</Label>
          <Textarea id="descriptionIt" name="descriptionIt" rows={5} required value={descriptionIt} onChange={(e) => setDescriptionIt(e.target.value)} />
          {state.errors?.descriptionIt && <p className="text-xs text-destructive">{state.errors.descriptionIt[0]}</p>}
        </div>

        {model && (
          <div className="flex items-center gap-2 text-sm">
            <Switch name="retranslate" id="retranslate" value="true" />
            <Label htmlFor="retranslate">Regenerate even if the Italian is unchanged</Label>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Category and price</h2>
        <div className="space-y-1">
          <Label htmlFor="categoryId">Category *</Label>
          <Select name="categoryId" value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="categoryId"><SelectValue /></SelectTrigger>
            <SelectContent>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {state.errors?.categoryId && <p className="text-xs text-destructive">{state.errors.categoryId[0]}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="priceSurcharge">Surcharge over category price</Label>
          <Input
            id="priceSurcharge" name="priceSurcharge" type="number" step="0.01" min="0"
            value={priceSurcharge ?? ''} onChange={(e) => setPriceSurcharge(e.target.value)}
            placeholder="optional, e.g. carbon frame"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Specifications</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label htmlFor="batteryRange">Battery range</Label>
            <Input id="batteryRange" name="batteryRange" value={batteryRange ?? ''} onChange={(e) => setBatteryRange(e.target.value)} placeholder="es. 80 km" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="motor">Motor</Label>
            <Input id="motor" name="motor" value={motor ?? ''} onChange={(e) => setMotor(e.target.value)} placeholder="es. Bosch CX" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="gearCount">Gears</Label>
            <Input id="gearCount" name="gearCount" value={gearCount ?? ''} onChange={(e) => setGearCount(e.target.value)} placeholder="es. Shimano 12v" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Sizes *</h2>
        {state.errors?.sizeIds && <p className="text-xs text-destructive">{state.errors.sizeIds[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {sizes.map((size) => (
            <div key={size.id} className="flex items-center gap-2">
              <Checkbox
                id={`size-${size.id}`} name="sizeIds" value={size.id}
                checked={sizeIds.includes(size.id)}
                onCheckedChange={(checked) => toggleSize(size.id, !!checked)}
              />
              <Label htmlFor={`size-${size.id}`} className="font-normal">{size.name}</Label>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Versions *</h2>
        {state.errors?.versionIds && <p className="text-xs text-destructive">{state.errors.versionIds[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {versions.map((version) => (
            <div key={version.id} className="flex items-center gap-2">
              <Checkbox
                id={`version-${version.id}`} name="versionIds" value={version.id}
                checked={versionIds.includes(version.id)}
                onCheckedChange={(checked) => toggleVersion(version.id, !!checked)}
              />
              <Label htmlFor={`version-${version.id}`} className="font-normal">{version.name}</Label>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Photos and video</h2>
        <p className="text-sm text-muted-foreground">The first item is the cover. Drag to reorder.</p>
        <MediaUpload
          ownerId={model?.id ?? 'new'}
          defaultItems={photos?.map((p) => ({ storageKey: p.storageKey, mediaType: p.mediaType })) ?? []}
          getPresignedUploadUrl={getBikeModelPresignedUploadUrlAction}
          getVideoPresignedUploadUrl={getBikeModelVideoPresignedUploadUrlAction}
        />
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]" disabled={isPending}>
          {isPending ? 'Saving...' : model ? 'Update model' : 'Create model'}
        </Button>
      </div>
    </form>
  )
}
