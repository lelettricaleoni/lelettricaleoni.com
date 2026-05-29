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
  const startTimeRef = useRef<number | null>(null)
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
      canvasContextAttributes: { antialias: true },
    })

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    map.on('load', () => {
      // 3D terrain via AWS Elevation Tiles (free, no API key)
      map.addSource('terrain-rgb', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 15,
        encoding: 'terrarium',
      })
      map.setTerrain({ source: 'terrain-rgb', exaggeration: 1.5 })

      // Atmospheric sky
      map.setSky({
        'sky-color': '#199EF3',
        'sky-horizon-blend': 0.5,
        'horizon-color': '#fbe59e',
        'horizon-fog-blend': 0.4,
        'fog-color': '#f3f6ff',
        'fog-ground-blend': 0.5,
        'atmosphere-blend': 0.5,
      })

      // GPX route line with glow
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
      mapRef.current = null
    }
  }, [points])

  function startFlyover() {
    if (!mapRef.current || points.length < 2) return
    setFlying(true)
    startTimeRef.current = null
    const DURATION = 35_000

    const frame = (now: number) => {
      const map = mapRef.current
      if (!map) return
      if (startTimeRef.current === null) startTimeRef.current = now
      const progress = Math.min((now - startTimeRef.current) / DURATION, 1)
      const { center, bearing } = getPositionAtProgress(points, progress)
      map.jumpTo({ center, zoom: 14.5, pitch: 65, bearing })
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
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
    if (map) map.fitBounds(getBounds(points), { padding: 60, pitch: 0, bearing: 0, duration: 800 })
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
