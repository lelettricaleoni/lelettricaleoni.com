# Grafico altimetrico per il flyover 3D — Implementation Plan

> **Per chi esegue questo piano:** SUB-SKILL RICHIESTA: usa
> superpowers:subagent-driven-development (consigliata) oppure
> superpowers:executing-plans per eseguire il piano attività per attività. I passi usano
> la sintassi checkbox (`- [ ]`) per il tracciamento.

**Obiettivo:** aggiungere un profilo altimetrico interattivo, sincronizzato col flyover 3D,
alla sezione mappa del dettaglio percorso — chiuso di default, caricato solo quando aperto.

**Architettura:** un nuovo componente presentazionale (`RouteElevationChart`, shadcn
Chart/Recharts) riceve quota e distanza già calcolate e comunica col genitore
(`RouteFlyover`, che già possiede il viewer Cesium) tramite callback. La sincronizzazione
— sia durante il volo automatico sia durante il trascinamento manuale — passa sempre dallo
stesso percorso di codice imperativo, mai da `setState` React per-frame.

**Tech Stack:** shadcn/ui Chart (Recharts) + Collapsible (nuove dipendenze), Cesium
(esistente), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-22-flyover-elevation-chart-design.md`

## Vincoli globali

- Nessuna sincronizzazione posizione→grafico passa da `setState` React ad alta frequenza
  (il volo aggiorna 60 volte al secondo) — solo riferimenti diretti a entità
  Cesium/DOM/`textContent`
- Un solo marker condiviso sulla mappa per volo automatico e trascinamento manuale, mai due
- Trascinare il grafico non muove mai la camera 3D; solo il bottone play la muove
- Il bundle del grafico (Recharts) si scarica solo quando il pannello si apre
- **Niente test browser automatizzati per questa feature**: già deciso e scartato in
  `docs/ai/ROADMAP.md` ("Test end-to-end del flyover 3D — WebGL headless più un token
  Cesium Ion: lento, ballerino, e verrebbe disattivato al primo fallimento casuale").
  Verifica dal vivo con Playwright MCP contro il dev server, non un test committato.
- `--webpack`, mai Turbopack; codice in inglese, testi utente in
  `messages/{it,en,de}.json`

---

### Task 1: `lib/geo.ts` — distanza condivisa

**Files:**
- Create: `lib/geo.ts`
- Create: `lib/geo.test.ts`
- Modify: `lib/gpx.ts:1-19`

**Interfaces:**
- Produces: `haversineKm(lat1, lon1, lat2, lon2): number`;
  `cumulativeDistancesKm(points: [number, number, number][]): number[]`

- [ ] **Step 1: Scrivere i test che falliscono**

Crea `lib/geo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { haversineKm, cumulativeDistancesKm } from './geo'

describe('haversineKm', () => {
  it('is zero for the same point', () => {
    expect(haversineKm(45, 10, 45, 10)).toBe(0)
  })

  it('matches the known distance for one degree of latitude', () => {
    // ~111.19 km per degree of latitude, at any longitude
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1)
  })
})

describe('cumulativeDistancesKm', () => {
  it('starts at zero', () => {
    const out = cumulativeDistancesKm([[10, 45, 0], [10, 46, 0]])
    expect(out[0]).toBe(0)
  })

  it('returns one value per point, monotonically increasing along a straight track', () => {
    const points: [number, number, number][] = [[10, 45, 0], [10, 45.1, 0], [10, 45.2, 0]]
    const out = cumulativeDistancesKm(points)
    expect(out).toHaveLength(3)
    expect(out[1]).toBeGreaterThan(out[0])
    expect(out[2]).toBeGreaterThan(out[1])
  })

  it('handles a single point without dividing by anything', () => {
    expect(cumulativeDistancesKm([[10, 45, 0]])).toEqual([0])
  })

  it('handles an empty track', () => {
    expect(cumulativeDistancesKm([])).toEqual([])
  })
})
```

- [ ] **Step 2: Eseguire i test, verificare che falliscano**

```bash
npm run test -- lib/geo.test.ts
```

Expected: FAIL — `lib/geo.ts` non esiste ancora.

- [ ] **Step 3: Creare `lib/geo.ts`**

```ts
/**
 * Distanza in km tra due punti su una sfera — stessa formula già in uso in
 * lib/gpx.ts (dove viene calcolata la distanza totale di un percorso durante
 * il parsing), spostata qui perché serve anche lato client, dove
 * lib/gpx.ts non va importato: trascina dentro fast-xml-parser, che un
 * componente client non deve scaricare solo per una formula di geometria.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Distanza cumulata in km ad ogni punto del tracciato — stessa lunghezza di
 * `points`, il primo valore sempre 0. Usata per l'asse X del grafico
 * altimetrico e per l'etichetta quota/distanza durante lo scrub.
 */
export function cumulativeDistancesKm(points: [number, number, number][]): number[] {
  if (points.length === 0) return []
  const distances: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const [lon1, lat1] = points[i - 1]
    const [lon2, lat2] = points[i]
    distances.push(distances[i - 1] + haversineKm(lat1, lon1, lat2, lon2))
  }
  return distances
}
```

- [ ] **Step 4: Eseguire i test, verificare che passino**

```bash
npm run test -- lib/geo.test.ts
```

Expected: PASS, tutti i test verdi.

- [ ] **Step 5: Aggiornare `lib/gpx.ts` per riusare `haversineKm`**

Trova:

```ts
import { XMLParser } from 'fast-xml-parser'

interface GpxStats {
  distanceKm: number
  elevationM: number
  durationMin?: number
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
```

Sostituisci con:

```ts
import { XMLParser } from 'fast-xml-parser'
import { haversineKm } from './geo'

interface GpxStats {
  distanceKm: number
  elevationM: number
  durationMin?: number
}
```

- [ ] **Step 6: Typecheck e test completi**

```bash
npm run typecheck
npm run test
```

Expected: nessun errore, tutti i test verdi (compresi quelli già esistenti su
`lib/gpx.test.ts`, invariati nel comportamento).

- [ ] **Step 7: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts lib/gpx.ts
git commit -m "Extract haversineKm into a shared, client-safe lib/geo.ts"
```

---

### Task 2: Colori difficoltà condivisi — `DIFFICULTY_HEX`

**Files:**
- Modify: `components/difficulty-badge.tsx`
- Modify: `components/route-flyover.tsx`

**Interfaces:**
- Produces: `DIFFICULTY_HEX: Record<string, string>` (esportato da `difficulty-badge.tsx`)

- [ ] **Step 1: Aggiungere la mappa esadecimale**

In `components/difficulty-badge.tsx`, trova:

```ts
export const DIFFICULTY_ACTIVE_STYLES: Record<string, string> = {
  easy:   'bg-green-500  text-white border-green-500',
  medium: 'bg-yellow-500 text-white border-yellow-500',
  hard:   'bg-orange-500 text-white border-orange-500',
  expert: 'bg-red-500    text-white border-red-500',
}
```

Aggiungi subito dopo:

```ts
/**
 * Stessi colori delle badge, in esadecimale: per i contesti che non possono
 * usare classi Tailwind — il tracciato e il marker del flyover 3D (Cesium),
 * il grafico altimetrico (Recharts).
 */
export const DIFFICULTY_HEX: Record<string, string> = {
  easy:   '#22c55e',
  medium: '#eab308',
  hard:   '#f97316',
  expert: '#ef4444',
}
```

- [ ] **Step 2: Aggiornare `route-flyover.tsx`**

Trova:

```ts
const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#22c55e',
  medium: '#eab308',
  hard:   '#f97316',
  expert: '#ef4444',
}
```

Sostituisci con:

```ts
import { DIFFICULTY_HEX } from './difficulty-badge'
```

(rimuovendo la definizione locale — l'import va aggiunto in cima al file, vicino agli
altri import).

Trova (2 occorrenze):

```ts
const trackColor = DIFFICULTY_COLORS[difficulty ?? ''] ?? '#795F91'
```

```ts
            color: Cesium.Color.fromCssColorString(DIFFICULTY_COLORS[difficulty ?? ''] ?? '#795F91'),
```

Sostituisci `DIFFICULTY_COLORS` con `DIFFICULTY_HEX` in entrambe (nessun'altra modifica).

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
grep -n "DIFFICULTY_COLORS" components/route-flyover.tsx
```

Expected: nessun errore; il grep non deve trovare nulla.

- [ ] **Step 4: Verifica dal vivo che il flyover funzioni ancora identico**

`npm run dev`, apri il dettaglio di un percorso, avvia il flyover: tracciato e marker
devono avere lo stesso colore di prima.

- [ ] **Step 5: Commit**

```bash
git add components/difficulty-badge.tsx components/route-flyover.tsx
git commit -m "Share difficulty hex colors between the flyover and the elevation chart"
```

---

### Task 3: Installare shadcn Chart e Collapsible

**Files:**
- Create: `components/ui/chart.tsx` (generato dal CLI)
- Create: `components/ui/collapsible.tsx` (generato dal CLI)
- Modify: `package.json` (nuove dipendenze: `recharts`, `@radix-ui/react-collapsible`)

- [ ] **Step 1: Installare**

```bash
npx shadcn@latest add chart collapsible
```

`components.json` esiste già in questo progetto, quindi il comando non è interattivo (vedi
CLAUDE.md).

- [ ] **Step 2: Typecheck e build**

```bash
npm run typecheck
npm run build
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/ui/chart.tsx components/ui/collapsible.tsx package.json package-lock.json
git commit -m "Add shadcn Chart and Collapsible components"
```

---

### Task 4: Componente `RouteElevationChart`

**Files:**
- Create: `components/route-elevation-chart.tsx`

**Interfaces:**
- Consumes: `ChartContainer`, `type ChartConfig` da `@/components/ui/chart`; `AreaChart`,
  `Area`, `CartesianGrid`, `XAxis`, `YAxis` da `recharts`; `DIFFICULTY_HEX` da
  `./difficulty-badge`
- Produces: `RouteElevationChart({ distances, heights, difficulty, onScrubStart,
  onScrubMove, onScrubEnd, registerCursorUpdater })` — componente client
  presentazionale, nessuna conoscenza di Cesium

- [ ] **Step 1: Creare il componente**

```tsx
'use client'
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { DIFFICULTY_HEX } from './difficulty-badge'

const MARGIN_LEFT = 8
const MARGIN_RIGHT = 8

interface RouteElevationChartProps {
  /** km cumulati, stessa lunghezza di heights — vedi lib/geo.ts */
  distances: number[]
  /** metri, quote ancorate al terreno — stesse disegnate sul tracciato 3D */
  heights: number[]
  difficulty?: string
  onScrubStart: () => void
  onScrubMove: (index: number) => void
  /** No-op per design: il cursore resta dov'è al rilascio, vedi lo spec */
  onScrubEnd: () => void
  registerCursorUpdater: (fn: (index: number) => void) => void
}

export function RouteElevationChart({
  distances, heights, difficulty, onScrubStart, onScrubMove, onScrubEnd, registerCursorUpdater,
}: RouteElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  const totalDistance = distances[distances.length - 1] || 1
  const data = useMemo(
    () => heights.map((h, i) => ({ distance: distances[i], elevation: Math.round(h) })),
    [distances, heights]
  )

  const color = DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'
  const chartConfig: ChartConfig = {
    elevation: { label: 'Elevation', color },
  }

  // Sposta solo il cursore CSS sopra il grafico — mai uno stato React. Chiamata
  // sia dal trascinamento (via onScrubMove più sotto) sia, tramite
  // registerCursorUpdater, dal loop del volo automatico dentro RouteFlyover.
  function moveCursorTo(index: number) {
    const container = containerRef.current
    const cursor = cursorRef.current
    if (!container || !cursor) return
    const plotWidth = container.clientWidth - MARGIN_LEFT - MARGIN_RIGHT
    const x = MARGIN_LEFT + (distances[index] / totalDistance) * plotWidth
    cursor.style.display = 'block'
    cursor.style.transform = `translateX(${x}px)`
  }

  useEffect(() => {
    registerCursorUpdater(moveCursorTo)
    // Si ri-registra solo se cambia il tracciato: moveCursorTo chiude su
    // distances/totalDistance, che cambiano solo quando cambia points nel
    // genitore — non ad ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distances, totalDistance])

  function indexAtClientX(clientX: number): number {
    const container = containerRef.current
    if (!container) return 0
    const rect = container.getBoundingClientRect()
    const plotWidth = rect.width - MARGIN_LEFT - MARGIN_RIGHT
    const x = clientX - rect.left - MARGIN_LEFT
    const targetDistance = Math.min(Math.max((x / plotWidth) * totalDistance, 0), totalDistance)

    let closest = 0
    let closestDiff = Infinity
    for (let i = 0; i < distances.length; i++) {
      const diff = Math.abs(distances[i] - targetDistance)
      if (diff < closestDiff) { closestDiff = diff; closest = i }
    }
    return closest
  }

  // Un solo aggiornamento per frame anche se pointermove spara più eventi —
  // stesso motivo per cui il volo automatico non passa da setState.
  function scheduleScrub(clientX: number) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const index = indexAtClientX(clientX)
      moveCursorTo(index)
      onScrubMove(index)
    })
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    onScrubStart()
    scheduleScrub(e.clientX)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    scheduleScrub(e.clientX)
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    onScrubEnd()
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative touch-none cursor-crosshair select-none')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={cursorRef}
        className="absolute top-2 bottom-0 w-px bg-foreground/70 pointer-events-none z-10"
        style={{ display: 'none', left: 0 }}
      />
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <AreaChart data={data} margin={{ top: 8, right: MARGIN_RIGHT, bottom: 0, left: MARGIN_LEFT }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="distance"
            tickFormatter={(v: number) => `${v.toFixed(1)} km`}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="elevation"
            tickFormatter={(v: number) => `${v} m`}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Area
            dataKey="elevation"
            type="monotone"
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: nessun errore.

- [ ] **Step 3: Commit**

```bash
git add components/route-elevation-chart.tsx
git commit -m "Add RouteElevationChart, a presentational elevation/distance chart"
```

---

### Task 5: Collegare il grafico a `RouteFlyover`

**Files:**
- Modify: `components/route-flyover.tsx`
- Modify: `components/route-flyover-loader.tsx`
- Modify: `app/[lang]/routes/[id]/page.tsx`

**Interfaces:**
- Consumes: `RouteElevationChart` (Task 4); `Collapsible`, `CollapsibleTrigger`,
  `CollapsibleContent` da `@/components/ui/collapsible`
- Produces: `RouteFlyover` accetta una nuova prop `labels: { toggle: string; altitude:
  string; distance: string }`; `RouteFlyoverLoader` la inoltra

- [ ] **Step 1: Import e caricamento differito del grafico**

In `components/route-flyover.tsx`, trova:

```ts
'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'
import { MapLoader } from '@/components/map-loader'
import { trackEvent } from '@/lib/analytics'
import { pickSampleIndices, interpolateHeights } from '@/lib/terrain'
```

Sostituisci con:

```ts
'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Play, Square, ChevronDown } from 'lucide-react'
import { MapLoader } from '@/components/map-loader'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { pickSampleIndices, interpolateHeights } from '@/lib/terrain'
import { cumulativeDistancesKm } from '@/lib/geo'

const ElevationChart = dynamic(
  () => import('./route-elevation-chart').then((m) => m.RouteElevationChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> }
)
```

- [ ] **Step 2: Nuova prop `labels`**

Trova:

```ts
export function RouteFlyover({ points, difficulty }: { points: Coord[]; difficulty?: string }) {
```

Sostituisci con:

```ts
interface FlyoverLabels {
  toggle: string
  altitude: string
  distance: string
}

export function RouteFlyover({
  points, difficulty, labels,
}: { points: Coord[]; difficulty?: string; labels: FlyoverLabels }) {
```

- [ ] **Step 3: Nuovo stato, ref e distanze**

Trova (dentro il corpo della funzione, subito dopo le righe esistenti):

```ts
  const heightsRef = useRef<number[]>(points.map(([, , ele]) => ele))
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
```

Sostituisci con:

```ts
  const heightsRef = useRef<number[]>(points.map(([, , ele]) => ele))
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const cursorEntityRef = useRef<CesiumType>(null)
  const chartCursorUpdaterRef = useRef<((index: number) => void) | null>(null)
  const infoLabelRef = useRef<HTMLSpanElement>(null)
  const distances = useMemo(() => cumulativeDistancesKm(points), [points])
```

- [ ] **Step 4: Resettare `cursorEntityRef` nella cleanup**

Trova:

```ts
    return () => {
      destroyed = true
      cameraHandlerRef.current?.()
      cameraHandlerRef.current = null
      viewerRef.current?.destroy()
      viewerRef.current = null
      cesiumRef.current = null
    }
  }, [points])
```

Sostituisci con:

```ts
    return () => {
      destroyed = true
      cameraHandlerRef.current?.()
      cameraHandlerRef.current = null
      viewerRef.current?.destroy()
      viewerRef.current = null
      cesiumRef.current = null
      // L'entità viene distrutta insieme al viewer: il riferimento va
      // invalidato qui, altrimenti un cambio di percorso (nuovo `points`)
      // riuserebbe un'entità che non esiste più.
      cursorEntityRef.current = null
    }
  }, [points])
```

- [ ] **Step 5: `ensureCursorEntity`, `updateChartCursor`, `updateCursorAt`, gli
  handler di scrub**

Trova la fine di `startFlyover` (subito prima della sua chiusura) — cerca:

```ts
  function startFlyover() {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium || points.length < 2) return
```

Aggiungi **prima** di questa funzione (così `ensureCursorEntity` è definita prima di
essere usata da `startFlyover`):

```ts
  // Un'unica entità per volo automatico e trascinamento manuale — creata al
  // primo utilizzo, qualunque dei due arrivi per primo. Nascosta finché
  // qualcosa non la posiziona davvero.
  function ensureCursorEntity(): CesiumType {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return null
    if (cursorEntityRef.current) return cursorEntityRef.current
    const entity = viewer.entities.add({
      show: false,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    cursorEntityRef.current = entity
    return entity
  }

  // Aggiorna solo il cursore del grafico e l'etichetta quota/distanza — mai
  // l'entità Cesium: durante il volo la posizione dell'entità è già guidata
  // da `pos` (SampledPositionProperty), impostarla di nuovo qui sarebbe
  // ridondante. Chiamata sia dal loop del volo sia da updateCursorAt sotto.
  function updateChartCursor(index: number) {
    chartCursorUpdaterRef.current?.(index)
    if (infoLabelRef.current) {
      const alt = Math.round(heightsRef.current[index])
      const dist = distances[index].toFixed(1)
      infoLabelRef.current.textContent = `${labels.altitude}: ${alt} m · ${labels.distance}: ${dist} km`
    }
  }

  // Solo trascinamento manuale: sposta anche l'entità Cesium a un punto
  // statico (nessun volo in corso, quindi nessuna SampledPositionProperty a
  // possederne la posizione).
  function updateCursorAt(index: number) {
    const Cesium = cesiumRef.current
    const entity = ensureCursorEntity()
    if (!Cesium || !entity) return
    const [lon, lat] = points[index]
    entity.availability = undefined
    entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, heightsRef.current[index] + MARKER_OFFSET_M)
    entity.show = true
    updateChartCursor(index)
  }

  function handleScrubStart() {
    if (flying) stopFlyover()
  }

  // No-op deliberato: il cursore resta dov'è al rilascio, non torna
  // all'inizio — vedi lo spec.
  function handleScrubEnd() {}

```

- [ ] **Step 6: Riusare l'entità condivisa dentro `startFlyover`**

Trova:

```ts
    if (entityRef.current) viewer.entities.remove(entityRef.current)
    const entity = viewer.entities.add({
      availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
      position: pos,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    entityRef.current = entity
```

Sostituisci con:

```ts
    const entity = ensureCursorEntity()
    entity.availability = new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })])
    entity.position = pos
    entity.show = true
```

- [ ] **Step 7: Rinominare `entityRef` in `cursorEntityRef` nel resto del file**

```bash
grep -n "entityRef" components/route-flyover.tsx
```

Ogni occorrenza rimasta (la dichiarazione originale `const entityRef = useRef<CesiumType>(null)`
in cima al componente) va rimossa — `cursorEntityRef` l'ha già sostituita al Task 5 Step 3.
Verifica con lo stesso grep che non ne resti nessuna orfana.

- [ ] **Step 8: Aggiungere l'avanzamento del cursore al loop del volo**

Trova, dentro il gestore `postUpdate`:

```ts
      offset.heading = smoothedHeading
      viewer.camera.lookAt(currentPos, offset)
    })
```

Sostituisci con:

```ts
      offset.heading = smoothedHeading
      viewer.camera.lookAt(currentPos, offset)

      const elapsedS = Cesium.JulianDate.secondsDifference(time, start)
      const t = Math.min(Math.max(elapsedS / DURATION_S, 0), 1)
      updateChartCursor(Math.round(t * (points.length - 1)))
    })
```

- [ ] **Step 9: Ridisegnare la barra dei controlli**

Trova (il blocco JSX finale del componente):

```tsx
      {ready && (
        <div className="flex justify-center">
          <button
            onClick={flying ? stopFlyover : startFlyover}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#366DA1] text-[#366DA1] bg-white text-sm font-semibold shadow-sm hover:bg-[#366DA1] hover:text-white transition-colors cursor-pointer"
          >
            {flying ? (
              <>
                <Square size={15} className="fill-current" />
                Stop flyover
              </>
            ) : (
              <>
                <Play size={15} className="fill-current" />
                Flyover 3D
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
```

Sostituisci con:

```tsx
      {ready && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={flying ? stopFlyover : startFlyover}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#366DA1] text-[#366DA1] bg-white text-sm font-semibold shadow-sm hover:bg-[#366DA1] hover:text-white transition-colors cursor-pointer"
            >
              {flying ? (
                <>
                  <Square size={15} className="fill-current" />
                  Stop flyover
                </>
              ) : (
                <>
                  <Play size={15} className="fill-current" />
                  Flyover 3D
                </>
              )}
            </button>

            <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
              <CollapsibleTrigger asChild>
                <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border bg-white text-sm font-semibold shadow-sm hover:bg-muted transition-colors cursor-pointer">
                  <ChevronDown size={15} className={cn('transition-transform', chartOpen && 'rotate-180')} />
                  {labels.toggle}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="w-full">
                <div className="pt-3 space-y-2">
                  <span ref={infoLabelRef} className="block text-center text-sm font-medium text-muted-foreground h-5" />
                  {chartOpen && (
                    <ElevationChart
                      distances={distances}
                      heights={heightsRef.current}
                      difficulty={difficulty}
                      onScrubStart={handleScrubStart}
                      onScrubMove={updateCursorAt}
                      onScrubEnd={handleScrubEnd}
                      registerCursorUpdater={(fn: (index: number) => void) => { chartCursorUpdaterRef.current = fn }}
                    />
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Aggiornare `RouteFlyoverLoader`**

Sostituisci **tutto** il contenuto di `components/route-flyover-loader.tsx` con:

```tsx
'use client'
import dynamic from 'next/dynamic'
import { MapLoader } from '@/components/map-loader'

type FlyoverLabels = { toggle: string; altitude: string; distance: string }
type FlyoverProps = { points: [number, number, number][]; difficulty?: string; labels: FlyoverLabels }

const Flyover = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  { ssr: false, loading: () => <MapLoader className="h-72 sm:h-[420px] rounded-xl" /> }
)

export function RouteFlyoverLoader({ points, difficulty, labels }: FlyoverProps) {
  return <Flyover points={points} difficulty={difficulty} labels={labels} />
}
```

- [ ] **Step 11: Passare le label dalla pagina di dettaglio**

In `app/[lang]/routes/[id]/page.tsx`, trova:

```tsx
        {/* Map / GPX flyover */}
        {gpxPoints.length > 1 && <RouteFlyoverLoader points={gpxPoints} difficulty={route.difficulty} />}
```

Sostituisci con:

```tsx
        {/* Map / GPX flyover */}
        {gpxPoints.length > 1 && (
          <RouteFlyoverLoader
            points={gpxPoints}
            difficulty={route.difficulty}
            labels={{
              toggle: d.elevation_chart_toggle,
              altitude: d.elevation_chart_altitude,
              distance: d.elevation_chart_distance,
            }}
          />
        )}
```

(Le chiavi `elevation_chart_*` arrivano dal Task 6 — questo step fa riferimento a chiavi
non ancora esistenti in `messages/*.json`: va bene, il Task 6 le aggiunge subito dopo e
niente si costruisce nel mezzo.)

- [ ] **Step 12: Typecheck**

```bash
npm run typecheck
```

Expected: errori sulle chiavi `elevation_chart_*` mancanti nel dizionario — attesi fino al
Task 6. Verifica che non ci siano **altri** errori oltre a questi.

- [ ] **Step 13: Commit**

```bash
git add components/route-flyover.tsx components/route-flyover-loader.tsx \
        "app/[lang]/routes/[id]/page.tsx"
git commit -m "Wire the elevation chart into the flyover, synced without per-frame React state"
```

---

### Task 6: Contenuti i18n

**Files:**
- Modify: `messages/it.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`

- [ ] **Step 1: `messages/it.json`**

Nel blocco `"routes"`, trova la chiave `"nav_label"` (fine del namespace, prima delle
chiavi `gpx_modal_*`):

```json
    "nav_label": "Percorsi",
    "gpx_modal_title": "Scarica il tracciato GPX",
```

Sostituisci con:

```json
    "nav_label": "Percorsi",
    "elevation_chart_toggle": "Profilo altimetrico",
    "elevation_chart_altitude": "quota",
    "elevation_chart_distance": "distanza",
    "gpx_modal_title": "Scarica il tracciato GPX",
```

- [ ] **Step 2: `messages/en.json`**

Stessa posizione:

```json
    "nav_label": "Routes",
    "elevation_chart_toggle": "Elevation profile",
    "elevation_chart_altitude": "altitude",
    "elevation_chart_distance": "distance",
    "gpx_modal_title": "Download the GPX track",
```

(Verifica il testo esatto di `nav_label`/`gpx_modal_title` già presenti nel file prima di
sostituire — l'inserimento va tra quelle due righe, qualunque sia il loro testo inglese
esatto.)

- [ ] **Step 3: `messages/de.json`**

Stessa posizione:

```json
    "nav_label": "Touren",
    "elevation_chart_toggle": "Höhenprofil",
    "elevation_chart_altitude": "Höhe",
    "elevation_chart_distance": "Distanz",
    "gpx_modal_title": "GPX-Track herunterladen",
```

(Stessa nota: verifica il testo tedesco esistente di `nav_label`/`gpx_modal_title` prima
di inserire tra le due righe.)

- [ ] **Step 4: Validare e typecheck**

```bash
node -e "require('./messages/it.json'); require('./messages/en.json'); require('./messages/de.json'); console.log('ok')"
npm run typecheck
```

Expected: `ok`, nessun errore — compresi quelli lasciati aperti dal Task 5 Step 12, ora
risolti.

- [ ] **Step 5: Commit**

```bash
git add messages/it.json messages/en.json messages/de.json
git commit -m "Add elevation chart labels to UI dictionaries (IT/EN/DE)"
```

---

### Task 7: Verifica dal vivo end-to-end

**Files:** nessuno — solo verifica, nessuna nuova modifica di codice.

- [ ] **Step 1: Build pulita**

```bash
npm run build
```

Expected: nessun errore.

- [ ] **Step 2: Avviare il dev server e aprire un percorso con GPX**

```bash
npm run dev
```

Con Playwright (MCP o script), apri `/it/routes/<id>` di un percorso con tracciato GPX
reale (almeno 2 punti).

- [ ] **Step 3: Verificare il pannello chiuso di default**

Il bottone "Profilo altimetrico" deve essere presente accanto a "Flyover 3D" non appena la
mappa è pronta; il grafico non deve essere nel DOM finché il pannello non si apre
(controllo Network: nessuna richiesta per il chunk di `route-elevation-chart` prima del
click).

- [ ] **Step 4: Verificare il trascinamento manuale**

Apri il pannello, trascina sul grafico (simula sia un drag mouse sia un gesto touch se
possibile): il marker sulla mappa deve spostarsi lungo il tracciato, l'etichetta
quota/distanza deve aggiornarsi, **la camera non deve muoversi**.

- [ ] **Step 5: Verificare la sincronizzazione durante il volo**

Avvia "Flyover 3D": il cursore sul grafico deve avanzare in sincronia con la camera. Ferma
il volo, poi trascina il grafico: deve riprendere il controllo manuale senza errori in
console.

- [ ] **Step 6: Verificare che trascinare durante il volo lo interrompa**

Avvia il volo, poi trascina il grafico mentre vola: il volo deve fermarsi (stesso effetto
del bottone "Stop") e il controllo deve passare al trascinamento, senza stati intermedi
inconsistenti.

- [ ] **Step 7: Controllare la console per errori**

Nessun errore o warning imprevisto nel log del browser durante l'intera sequenza sopra.

- [ ] **Step 8: Verificare le tre lingue**

Apri lo stesso percorso in `/en/routes/<id>` e `/de/routes/<id>`: l'etichetta del bottone e
il testo quota/distanza devono essere nella lingua corretta.

Nessun commit per questo task — se qualcosa non torna, si torna ai task precedenti a
correggere, non si aggiunge codice qui.
