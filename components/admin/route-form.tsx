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
  const [startPointLabel, setStartPointLabel] = useState(itTranslation?.startPointLabel ?? '')
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
      {/* Testi IT */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Contenuto (italiano)</h2>
        <p className="text-sm text-muted-foreground">EN e DE vengono generati automaticamente con Azure Translator al salvataggio.</p>

        <div className="space-y-1">
          <Label htmlFor="nameIt">Nome percorso *</Label>
          <Input id="nameIt" name="nameIt" required value={nameIt} onChange={(e) => setNameIt(e.target.value)} />
          {state.errors?.nameIt && <p className="text-xs text-destructive">{state.errors.nameIt[0]}</p>}
        </div>

        <div className="space-y-1">
          <Label htmlFor="startPointLabel">Punto di partenza</Label>
          <Input
            id="startPointLabel" name="startPointLabel"
            placeholder="es. Dro, Via Roma 90"
            value={startPointLabel}
            onChange={(e) => setStartPointLabel(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="descriptionIt">Descrizione *</Label>
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
            <Label htmlFor="retranslate">Rigenera traduzioni EN/DE (Azure)</Label>
          </div>
        )}
      </section>

      {/* Statistiche */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Statistiche</h2>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="difficulty">Difficoltà *</Label>
            <Select name="difficulty" value={difficulty} onValueChange={(v) => setDifficulty(v as typeof difficulty)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Facile</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="hard">Difficile</SelectItem>
                <SelectItem value="expert">Esperto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="surface">Fondo *</Label>
            <Select name="surface" value={surface} onValueChange={(v) => setSurface(v as typeof surface)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asphalt">Asfalto</SelectItem>
                <SelectItem value="dirt">Sterrato</SelectItem>
                <SelectItem value="mixed">Misto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="distanceKm">Distanza (km)</Label>
            <Input
              id="distanceKm" name="distanceKm" type="number" step="0.1" min="0"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              placeholder="auto da GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="elevationM">Dislivello (m)</Label>
            <Input
              id="elevationM" name="elevationM" type="number" min="0"
              value={elevationM}
              onChange={(e) => setElevationM(e.target.value)}
              placeholder="auto da GPX"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="durationMin">Durata (minuti)</Label>
            <Input
              id="durationMin" name="durationMin" type="number" min="1"
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="es. 180"
            />
          </div>
        </div>
      </section>

      {/* Tipo bici */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Tipo di bici *</h2>
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

      {/* Link esterni */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Link esterni</h2>
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

      {/* GPX */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">File GPX</h2>
        <GpxUpload
          routeId={route?.id ?? 'new'}
          defaultGpxKey={route?.gpxKey ?? undefined}
          onUploaded={handleGpxUploaded}
        />
      </section>

      {/* Foto */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#1e3a5f]">Galleria foto</h2>
        <p className="text-sm text-muted-foreground">La prima foto è la copertina. Trascina per riordinare.</p>
        <PhotoUpload
          routeId={route?.id ?? 'new'}
          defaultPhotos={photos ?? []}
        />
      </section>

      {state.message && <p className="text-sm text-destructive">{state.message}</p>}

      <div className="flex gap-3">
        <Button type="submit" className="bg-[#1e3a5f] hover:bg-[#152c4a]" disabled={isPending}>
          {isPending ? 'Salvataggio...' : route ? 'Aggiorna percorso' : 'Crea percorso'}
        </Button>
      </div>
    </form>
  )
}
