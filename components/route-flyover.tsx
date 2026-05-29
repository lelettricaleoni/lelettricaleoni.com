'use client'
import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Coord = [number, number, number] // [lon, lat, ele]

interface RouteFlyoverProps {
  points: Coord[]
}

const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri &amp; contributors',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
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
  const center: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

  // Bearing calcolato su finestra larga per smorzare il rumore GPS
  const window = Math.max(20, Math.floor(n * 0.05))
  const fromIdx = Math.max(0, idx - 3)
  const toIdx = Math.min(n - 1, idx + window)
  const bearing = computeBearing(points[fromIdx], points[toIdx])

  return { center, bearing }
}

// Smoothing esponenziale del bearing con gestione wrap 0°/360°
function smoothBearingStep(current: number, target: number, factor: number): number {
  let diff = target - current
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return current + diff * factor
}

function getBounds(points: Coord[]): [[number, number], [number, number]] {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lon, lat] of points) {
    if (lon < minLon) minLon = lon
    if (lon > maxLon) maxLon = lon
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return [[minLon, minLat], [maxLon, maxLat]]
}

export function RouteFlyover({ points }: RouteFlyoverProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const rafRef = useRef<number | null>(null)
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return

    const bounds = getBounds(points)

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      bounds,
      fitBoundsOptions: { padding: 60 },
      pitch: 0,
      bearing: 0,
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', () => {
      // Terreno 3D
      map.addSource('terrain-rgb', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
      })
      map.setTerrain({ source: 'terrain-rgb', exaggeration: 1.5 })

      // Tracciato GPX
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points } },
      })
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': 0.35 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#366DA1', 'line-width': 3 },
      })

      // Pallino mobile
      map.addSource('dot', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: points[0] } },
      })
      map.addLayer({
        id: 'dot-halo',
        type: 'circle',
        source: 'dot',
        paint: { 'circle-radius': 16, 'circle-color': '#795F91', 'circle-opacity': 0.25 },
      })
      map.addLayer({
        id: 'dot',
        type: 'circle',
        source: 'dot',
        paint: {
          'circle-radius': 8,
          'circle-color': '#795F91',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffffff',
        },
      })

      setReady(true)
    })

    mapRef.current = map
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      map.remove()
      mapRef.current = null
    }
  }, [points])

  function startFlyover() {
    const map = mapRef.current
    if (!map || points.length < 2) return
    setFlying(true)

    const startTime = performance.now()
    const DURATION = 55_000
    let lastCameraUpdate = 0
    let smoothedBearing = getPositionAtProgress(points, 0).bearing

    const frame = () => {
      const progress = Math.min((performance.now() - startTime) / DURATION, 1)
      const { center, bearing: rawBearing } = getPositionAtProgress(points, progress)

      // Smoothing esponenziale: filtra oscillazioni GPS, mantiene le svolte reali
      smoothedBearing = smoothBearingStep(smoothedBearing, rawBearing, 0.07)

      // Aggiorna pallino ogni frame → movimento fluido
      const dotSrc = map.getSource('dot') as maplibregl.GeoJSONSource
      dotSrc.setData({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: center } })

      // Telecamera segue con ritardo naturale — non rigida
      const now = performance.now()
      if (now - lastCameraUpdate > 80) {
        lastCameraUpdate = now
        map.easeTo({
          center,
          bearing: smoothedBearing,
          zoom: 13,
          pitch: 48,
          duration: 300,
          easing: (t) => t * (2 - t),
        })
      }

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        rafRef.current = null
        setFlying(false)
        map.fitBounds(getBounds(points), { padding: 60, pitch: 0, bearing: 0, duration: 1500 })
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
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 shadow-md text-sm font-medium text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
        >
          {flying ? '⏹ Stop' : '▶ Flyover 3D'}
        </button>
      )}
    </div>
  )
}
