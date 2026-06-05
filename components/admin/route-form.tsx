'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { GpxUpload } from './gpx-upload'
import { PhotoUpload } from './photo-upload'
import type { RouteFormState } from '@/lib/actions/routes'
import type { Route, RouteTranslation, RoutePhoto } from '@/lib/db'

const BIKE_TYPES = ['eMTB', 'MTB', 'Road Bike', 'E-Road Bike', 'Gravel', 'E-Gravel', 'City Bike', 'E-City Bike']

interface RouteFormProps {
  action: (prev: RouteFormState, formData: FormData) => Promise<RouteFormState>
  route?: Route
  translations?: RouteTranslation[]
  photos?: RoutePhoto[]
}

export function RouteForm({ action, route, translations, photos }: RouteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})
  const itTranslation = translations?.find((t) => t.locale === 'it')

  const [nameIt, setNameIt] = useState(itTranslation?.name ?? '')
  const [descriptionIt, setDescriptionIt] = useState(itTranslation?.description ?? '')
  const [difficulty, setDifficulty] = useState(route?.difficulty ?? 'easy')
  const [surface, setSurface] = useState(route?.surface ?? 'mixed')
  const [distanceKm, setDistanceKm] = useState(route?.distanceKm ?? '')
  const [elevationM, setElevationM] = useState(route?.elevationM?.toString() ?? '')
  const [durationMin, setDurationMin] = useState(route?.durationMin?.toString() ?? '')
  const [stravaUrl, setStravaUrl] = useState(route?.stravaUrl ?? '')
  const [komootUrl, setKomootUrl] = useState(route?.komootUrl ?? '')
  const [bikeTypes, setBikeTypes] = useState<string[]>(route?.bikeTypes ?? [])

  function handleGpxUploaded(_key: string, stats: { distanceKm: number; elevationM: number; durationMin?: number }) {
    setDistanceKm(stats.distanceKm.toString())
    setElevationM(stats.elevationM.toString())
    if (stats.durationMin) setDurationMin(stats.durationMin.toString())
  }

  function toggleBikeType(type: string, checked: boolean) {
    setBikeTypes((prev) => checked ? [...prev, type] : prev.filter((t) => t !== type))
  }

  return (
    <form action={formAction} className="space-y-8 max-w-2xl">
      {/* Italian text */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Content (Italian)</h2>
        <p className="text-sm text-muted-foreground">EN and DE are auto-generated with Azure Translator on save.</p>

        <div className="space-y-1">
          <Label htmlFor="nameIt">Route name *</Label>
          <Input id="nameIt" name="nameIt" required value={nameIt} onChange={(e) => setNameIt(e.target.value)} />
          {state.errors?.nameIt && <p className="text-xs text-destructive">{state.errors.nameIt[0]}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="descriptionIt">Description *</Label>
          <Textarea
            id="descriptionIt" name="descriptionIt" rows={5} required
            value={descriptionIt}
            onChange={(e) => setDescriptionIt(e.target.value)}
          />
          {state.errors?.descriptionIt && <p className="text-xs text-destructive">{state.errors.descriptionIt[0]}</p>}
        </div>

        {route && (
          <div className="flex items-center gap-2 text-sm">
            <Switch name="retranslate" id="retranslate" value="true" />
            <Label htmlFor="retranslate">Regenerate EN/DE translations (Azure)</Label>
          </div>
        )}
      </section>

      {/* GPX */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">GPX file</h2>
        <GpxUpload
          routeId={route?.id ?? 'new'}
          defaultGpxKey={route?.gpxKey ?? undefined}
          onUploaded={handleGpxUploaded}
        />
      </section>

      {/* Stats */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Statistics</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="difficulty">Difficulty *</Label>
            <Select name="difficulty" value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="surface">Surface *</Label>
            <Select name="surface" value={surface} onValueChange={(v) => setSurface(v as typeof surface)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asphalt">Asphalt</SelectItem>
                <SelectItem value="dirt">Dirt</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="distanceKm">Distance (km)</Label>
            <Input
              id="distanceKm" name="distanceKm" type="number" step="0.1" min="0"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="auto from GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="elevationM">Elevation gain (m)</Label>
            <Input
              id="elevationM" name="elevationM" type="number" min="0"
              value={elevationM}
              onChange={(e) => setElevationM(e.target.value)}
              placeholder="auto from GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durationMin">Duration (minutes)</Label>
            <Input
              id="durationMin" name="durationMin" type="number" min="1"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="es. 180"
            />
          </div>
        </div>
      </section>

      {/* Bike type */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Bike type *</h2>
        {state.errors?.bikeTypes && <p className="text-xs text-destructive">{state.errors.bikeTypes[0]}</p>}
        <div className="flex flex-wrap gap-4">
          {BIKE_TYPES.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <Checkbox
                id={`bike-${type}`}
                name="bikeTypes"
                value={type}
                checked={bikeTypes.includes(type)}
                onCheckedChange={(checked) => toggleBikeType(type, !!checked)}
              />
              <Label htmlFor={`bike-${type}`} className="font-normal">{type}</Label>
            </div>
          ))}
        </div>
      </section>

      {/* External links */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">External links</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="stravaUrl">Strava URL</Label>
            <Input
              id="stravaUrl" name="stravaUrl" type="url"
              value={stravaUrl}
              onChange={(e) => setStravaUrl(e.target.value)}
              placeholder="https://www.strava.com/routes/..."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="komootUrl">Komoot URL</Label>
            <Input
              id="komootUrl" name="komootUrl" type="url"
              value={komootUrl}
              onChange={(e) => setKomootUrl(e.target.value)}
              placeholder="https://www.komoot.com/tour/..."
            />
          </div>
        </div>
      </section>

      {/* Photos */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Photo gallery</h2>
        <p className="text-sm text-muted-foreground">First photo is the cover. Drag to reorder.</p>
        <PhotoUpload
          routeId={route?.id ?? 'new'}
          defaultPhotos={photos ?? []}
        />
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]" disabled={isPending}>
          {isPending ? 'Saving...' : route ? 'Update route' : 'Create route'}
        </Button>
      </div>
    </form>
  )
}
