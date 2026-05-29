'use client'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points as LatLngBoundsExpression, { padding: [24, 24] })
    }
  }, [map, points])
  return null
}

interface RouteMapProps {
  points: [number, number][]
}

export function RouteMap({ points }: RouteMapProps) {
  if (points.length < 2) return null

  const center = points[Math.floor(points.length / 2)]

  return (
    <div className="h-72 sm:h-96 rounded-xl overflow-hidden border border-border isolate">
      <MapContainer
        center={center}
        zoom={13}
        className="h-full w-full"
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={points}
          pathOptions={{ color: '#366DA1', weight: 3, opacity: 0.85 }}
        />
        <FitBounds points={points} />
      </MapContainer>
    </div>
  )
}
