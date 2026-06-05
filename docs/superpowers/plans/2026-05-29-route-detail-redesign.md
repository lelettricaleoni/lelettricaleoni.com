# Route Detail Page Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the route detail page with MapLibre GL JS 3D terrain flyover, icon-based stat cards, bento photo grid, and consistent page width.

**Architecture:** Replace the existing Leaflet 2D map with a MapLibre GL JS component that renders a 3D terrain map (AWS Terrain Tiles + OpenFreeMap style) with an animated camera flyover along the GPX track. The GPX coordinate format is updated from `[lat, lon]` to `[lon, lat, ele]` (GeoJSON). Stats cards get icons. Photo gallery becomes a bento grid.

**Tech Stack:** maplibre-gl v5, AWS Terrain Tiles (terrarium encoding, free, no API key), OpenFreeMap liberty style (free, no API key), yet-another-react-lightbox (existing).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/gpx.ts` | Modify | `parseGpxPoints` returns `[lon, lat, ele][]` |
| `components/route-flyover.tsx` | Create | MapLibre GL JS map + flyover animation |
| `components/route-flyover-loader.tsx` | Create | `dynamic({ ssr: false })` wrapper |
| `app/[lang]/percorsi/[slug]/page.tsx` | Modify | Width fix, flyover, icon stats |
| `components/route-gallery.tsx` | Modify | Bento grid layout |
| `components/route-map.tsx` | Delete | Replaced by flyover |
| `components/route-map-loader.tsx` | Delete | Replaced by flyover loader |

---

### Task 1: Install maplibre-gl + update coordinate format

**Files:**
- Modify: `lib/gpx.ts:62-79`
- Run: `npm install maplibre-gl`

- [ ] **Step 1: Install package**

```bash
npm install maplibre-gl
```

Expected: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Update `parseGpxPoints` in `lib/gpx.ts`**

Replace the entire `parseGpxPoints` function (lines 62–79):

```ts
export function parseGpxPoints(gpxString: string): [number, number, number][] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const obj = parser.parse(gpxString)
  const trkseg = obj?.gpx?.trk?.trkseg
  const rawPoints = trkseg?.trkpt ?? []
  const all: [number, number, number][] = (
    Array.isArray(rawPoints) ? rawPoints : [rawPoints]
  ).map((p: Record<string, unknown>) => [
    parseFloat(String(p['@_lon'] ?? 0)), // lon first (GeoJSON)
    parseFloat(String(p['@_lat'] ?? 0)),
    parseFloat(String(p['ele'] ?? 0)),
  ])
  if (all.length > 800) {
    const step = Math.ceil(all.length / 800)
    return all.filter((_, i) => i % step === 0)
  }
  return all
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on `lib/gpx.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/gpx.ts package.json package-lock.json
git commit -m "feat: install maplibre-gl, update parseGpxPoints to GeoJSON [lon,lat,ele] format"
```

---

### Task 2: Create RouteFlyover component

**Files:**
- Create: `components/route-flyover.tsx`

- [ ] **Step 1: Create `components/route-flyover.tsx`**

```tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Coord = [number, number, number] // [lon, lat, ele]

interface RouteFlyoverProps {
  points: Coord[]
}

function computeBearing(a: Coord, b: Coord): number {
  const dLon = ((b[0] - a[0]) * Math.PI) / 180
  const φ1 = (a[1] * Math.PI) / 180
  const φ2 = (b[1] * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function getPositionAtProgress(points: Coord[], progress: number) {
  const n = points.length
  const floatIdx = Math.min(progress * (n - 1), n - 2)
  const idx = Math.floor(floatIdx)
  const t = floatIdx - idx
  const a = points[idx]
  const b = points[Math.min(idx + 1, n - 1)]
  return {
    center: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [number, number],
    bearing: computeBearing(a, b),
  }
}

function getBounds(points: Coord[]): [[number, number], [number, number]] {
  const minLon = points.reduce((m, p) => Math.min(m, p[0]), Infinity)
  const maxLon = points.reduce((m, p) => Math.max(m, p[0]), -Infinity)
  const minLat = points.reduce((m, p) => Math.min(m, p[1]), Infinity)
  const maxLat = points.reduce((m, p) => Math.max(m, p[1]), -Infinity)
  return [[minLon, minLat], [maxLon, maxLat]]
}

export function RouteFlyover({ points }: RouteFlyoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const rafRef = useRef<number | null>(null)
  const startRef = useRef<number | null>(null)
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return

    const bounds = getBounds(points)

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      bounds,
      fitBoundsOptions: { padding: 60 },
      pitch: 0,
      bearing: 0,
      antialias: true,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', () => {
      map.addSource('terrain-rgb', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
      } as maplibregl.RasterDEMSourceSpecification)

      map.setTerrain({ source: 'terrain-rgb', exaggeration: 1.5 })

      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15,
        },
      } as maplibregl.SkyLayerSpecification)

      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: points },
        },
      })

      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.35 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#366DA1', 'line-width': 3 },
      })

      setReady(true)
    })

    mapRef.current = map
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      map.remove()
    }
  }, [points])

  function startFlyover() {
    const map = mapRef.current
    if (!map || points.length < 2) return
    setFlying(true)
    startRef.current = null
    const DURATION = 35_000

    function frame(now: number) {
      if (startRef.current === null) startRef.current = now
      const progress = Math.min((now - startRef.current) / DURATION, 1)
      const { center, bearing } = getPositionAtProgress(points, progress)
      map.jumpTo({ center, zoom: 14.5, pitch: 65, bearing })
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        setFlying(false)
        const bounds = getBounds(points)
        map.fitBounds(bounds, { padding: 60, pitch: 0, bearing: 0, duration: 1500 })
      }
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  function stopFlyover() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
    setFlying(false)
    const map = mapRef.current
    if (!map) return
    map.fitBounds(getBounds(points), { padding: 60, pitch: 0, bearing: 0, duration: 800 })
  }

  return (
    <div className="relative rounded-xl overflow-hidden border border-border isolate">
      <div ref={containerRef} className="h-72 sm:h-[420px] w-full" />
      {ready && (
        <button
          onClick={flying ? stopFlyover : startFlyover}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 shadow-md text-sm font-medium text-[#1e3a5f] hover:bg-white transition-colors backdrop-blur-sm"
        >
          {flying ? '⏹ Stop' : '▶ Flyover 3D'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on the new component.

- [ ] **Step 3: Commit**

```bash
git add components/route-flyover.tsx
git commit -m "feat: add RouteFlyover — MapLibre GL JS 3D terrain with animated flyover"
```

---

### Task 3: Create RouteFlyoverLoader

**Files:**
- Create: `components/route-flyover-loader.tsx`

- [ ] **Step 1: Create file**

```tsx
'use client'
import dynamic from 'next/dynamic'

const RouteFlyoverInner = dynamic(
  () => import('@/components/route-flyover').then((m) => m.RouteFlyover),
  {
    ssr: false,
    loading: () => <div className="h-72 sm:h-[420px] rounded-xl bg-muted animate-pulse" />,
  }
)

export function RouteFlyoverLoader({ points }: { points: [number, number, number][] }) {
  return <RouteFlyoverInner points={points} />
}
```

- [ ] **Step 2: Commit**

```bash
git add components/route-flyover-loader.tsx
git commit -m "feat: add RouteFlyoverLoader — SSR-safe dynamic import wrapper"
```

---

### Task 4: Redesign route detail page

**Files:**
- Modify: `app/[lang]/percorsi/[slug]/page.tsx`

Changes:
1. `max-w-4xl` → `max-w-6xl px-4 sm:px-6` (match list page width)
2. Replace `RouteMapLoader` import+usage with `RouteFlyoverLoader`
3. Replace stats grid with icon cards
4. Remove unused `TrendingUp` import (now inside stats), add `Ruler, Clock, Layers`

- [ ] **Step 1: Update imports**

Replace:
```tsx
import { ArrowLeft, TrendingUp } from 'lucide-react'
import { RouteMapLoader } from '@/components/route-map-loader'
```

With:
```tsx
import { ArrowLeft, Ruler, TrendingUp, Clock, Layers } from 'lucide-react'
import { RouteFlyoverLoader } from '@/components/route-flyover-loader'
```

- [ ] **Step 2: Fix container width**

Replace:
```tsx
<main className="max-w-4xl mx-auto px-4 pt-24 pb-8 space-y-8">
```
With:
```tsx
<main className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-8 space-y-8">
```

- [ ] **Step 3: Replace map component usage**

Replace:
```tsx
{gpxPoints.length > 1 && <RouteMapLoader points={gpxPoints} />}
```
With:
```tsx
{gpxPoints.length > 1 && <RouteFlyoverLoader points={gpxPoints} />}
```

- [ ] **Step 4: Replace stats section with icon cards**

Replace the entire stats `<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-muted/40 rounded-xl p-4">` block with:

```tsx
{/* Stats */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  {route.distanceKm && (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
      <Ruler size={20} className="text-[#366DA1]" />
      <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
        {route.distanceKm}<span className="text-sm font-normal ml-0.5">km</span>
      </p>
      <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_distance}</p>
    </div>
  )}
  {route.elevationM != null && (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
      <TrendingUp size={20} className="text-[#366DA1]" />
      <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
        {route.elevationM}<span className="text-sm font-normal ml-0.5">m</span>
      </p>
      <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_elevation}</p>
    </div>
  )}
  {route.durationMin && (
    <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
      <Clock size={20} className="text-[#366DA1]" />
      <p className="text-2xl font-bold text-[#1e3a5f] leading-none">
        {Math.floor(route.durationMin / 60)}h{route.durationMin % 60 > 0 ? `${route.durationMin % 60}m` : ''}
      </p>
      <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_duration}</p>
    </div>
  )}
  <div className="flex flex-col items-center gap-2 rounded-2xl border bg-white p-4 shadow-sm">
    <Layers size={20} className="text-[#366DA1]" />
    <p className="text-2xl font-bold text-[#1e3a5f] leading-none capitalize">
      {d[`surface_${route.surface}` as keyof typeof d] ?? route.surface}
    </p>
    <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">{d.stat_surface}</p>
  </div>
</div>
```

- [ ] **Step 5: Verify TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add "app/[lang]/percorsi/[slug]/page.tsx"
git commit -m "feat: route detail — max-w-6xl, RouteFlyoverLoader, icon stat cards"
```

---

### Task 5: Redesign gallery to bento grid

**Files:**
- Modify: `components/route-gallery.tsx`

- [ ] **Step 1: Replace gallery layout**

Replace the entire file content with:

```tsx
'use client'
import { useState } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import { r2PublicUrl } from '@/lib/r2'
import type { RoutePhoto } from '@/lib/db'

export function RouteGallery({ photos, routeName }: { photos: RoutePhoto[]; routeName: string }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)

  if (photos.length === 0) return null

  const slides = photos.map((p) => ({ src: r2PublicUrl(p.storageKey) }))

  function openAt(i: number) { setIndex(i); setOpen(true) }

  return (
    <>
      {photos.length === 1 && (
        <button
          onClick={() => openAt(0)}
          className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
        >
          <Image
            src={r2PublicUrl(photos[0].storageKey)}
            alt={photos[0].altText ?? `${routeName} foto 1`}
            fill className="object-cover"
            sizes="100vw"
          />
        </button>
      )}

      {photos.length === 2 && (
        <div className="grid grid-cols-2 gap-2 h-64 sm:h-80">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => openAt(i)}
              className={`relative overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none ${i === 0 ? 'rounded-l-xl' : 'rounded-r-xl'}`}
            >
              <Image
                src={r2PublicUrl(photo.storageKey)}
                alt={photo.altText ?? `${routeName} foto ${i + 1}`}
                fill className="object-cover"
                sizes="50vw"
              />
            </button>
          ))}
        </div>
      )}

      {photos.length >= 3 && (
        <div className="grid grid-cols-3 grid-rows-2 gap-2 h-64 sm:h-80">
          {/* First photo — spans 2 cols × 2 rows */}
          <button
            onClick={() => openAt(0)}
            className="col-span-2 row-span-2 relative rounded-l-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
          >
            <Image
              src={r2PublicUrl(photos[0].storageKey)}
              alt={photos[0].altText ?? `${routeName} foto 1`}
              fill className="object-cover"
              sizes="(max-width: 768px) 66vw, 50vw"
            />
          </button>
          {/* Second photo */}
          <button
            onClick={() => openAt(1)}
            className="relative rounded-tr-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
          >
            <Image
              src={r2PublicUrl(photos[1].storageKey)}
              alt={photos[1].altText ?? `${routeName} foto 2`}
              fill className="object-cover"
              sizes="(max-width: 768px) 34vw, 25vw"
            />
          </button>
          {/* Third photo — with +N overlay if more */}
          <button
            onClick={() => openAt(2)}
            className="relative rounded-br-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
          >
            <Image
              src={r2PublicUrl(photos[2].storageKey)}
              alt={photos[2].altText ?? `${routeName} foto 3`}
              fill className="object-cover"
              sizes="(max-width: 768px) 34vw, 25vw"
            />
            {photos.length > 3 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-2xl font-bold">
                +{photos.length - 3}
              </span>
            )}
          </button>
        </div>
      )}

      <Lightbox open={open} close={() => setOpen(false)} index={index} slides={slides} />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/route-gallery.tsx
git commit -m "feat: route gallery — bento grid (1 large + 2 small + +N overlay)"
```

---

### Task 6: Remove old Leaflet components

**Files:**
- Delete: `components/route-map.tsx`
- Delete: `components/route-map-loader.tsx`
- Optionally: `npm uninstall leaflet react-leaflet @types/leaflet`

- [ ] **Step 1: Delete old files**

```bash
rm components/route-map.tsx components/route-map-loader.tsx
```

- [ ] **Step 2: Check no remaining imports**

```bash
grep -r "route-map" --include="*.tsx" --include="*.ts" .
```

Expected: no results.

- [ ] **Step 3: Uninstall Leaflet**

```bash
npm uninstall leaflet react-leaflet @types/leaflet
```

- [ ] **Step 4: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Leaflet — replaced by MapLibre GL JS flyover"
```
