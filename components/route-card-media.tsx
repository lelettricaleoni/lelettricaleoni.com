'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Hls from 'hls.js'
import { Mountain, Loader2 } from 'lucide-react'
import { r2PublicUrl } from '@/lib/r2'
import { hlsUrl, type MediaWithHls } from '@/lib/media-client'
import type { RoutePhoto } from '@/lib/db'

interface MapCenter { lat: number; lon: number; zoom: number }

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#22c55e',
  medium: '#eab308',
  hard:   '#f97316',
  expert: '#ef4444',
}

interface RouteCardMediaProps {
  media?: MediaWithHls
  gpxPath?: string
  mapCenter?: MapCenter
  difficulty?: string | null
  routeName: string
}

function latLonToTileXY(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const xFloat = (lon + 180) / 360 * n
  const sinLat = Math.sin(lat * Math.PI / 180)
  const cosLat = Math.cos(lat * Math.PI / 180)
  const yFloat = (1 - Math.log((1 + sinLat) / cosLat) / Math.PI) / 2 * n
  return { x: Math.floor(xFloat), y: Math.floor(yFloat), fracX: xFloat % 1, fracY: yFloat % 1 }
}

export function RouteCardMedia({ media, gpxPath, mapCenter, difficulty, routeName }: RouteCardMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [videoError, setVideoError] = useState(false)
  // Tiles are client-only to avoid SSR/hydration mismatch
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!media || media.mediaType !== 'video' || !videoRef.current || !isVisible) return
    const src = media.hlsUrl ?? hlsUrl(media.storageKey)
    let hls: Hls | null = null
    setVideoError(false)

    if (Hls.isSupported()) {
      hls = new Hls({ startLevel: -1 })
      hls.loadSource(src)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) setVideoError(true)
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = src
      videoRef.current.onerror = () => setVideoError(true)
    } else {
      setVideoError(true)
    }

    return () => hls?.destroy()
  }, [media, isVisible])

  if (!media) {
    if (gpxPath) {
      if (mapCenter && mounted) {
        const { lat, lon, zoom } = mapCenter
        const { x: tx, y: ty, fracX, fracY } = latLonToTileXY(lat, lon, zoom)
        // Shift so the route center aligns with the card center
        const shiftX = Math.round(256 + fracX * 256)
        const shiftY = Math.round(256 + fracY * 256)
        const tiles: string[] = []
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            tiles.push(`/api/map-tile/${zoom}/${tx + dx}/${ty + dy}`)
          }
        }
        return (
          <div ref={containerRef} className="relative w-full h-full overflow-hidden">
            {/* Map tile grid — 3×3 tiles centered on route bbox center. The GPX path lives inside
                this same transformed box, in the tiles' own Web Mercator pixel space, so it lines
                up with the terrain instead of a separately-scaled schematic overlay. */}
            <div
              className="absolute"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-${shiftX}px, -${shiftY}px)`,
                width: '768px',
                height: '768px',
              }}
            >
              <div
                className="absolute inset-0"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 256px)' }}
              >
                {tiles.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={url} alt="" width={256} height={256} style={{ display: 'block' }} />
                ))}
              </div>
              <svg viewBox="0 0 768 768" className="absolute inset-0 w-full h-full">
                <path
                  d={gpxPath}
                  fill="none"
                  stroke={DIFFICULTY_COLORS[difficulty ?? ''] ?? '#795F91'}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(${shiftX}, ${shiftY})`}
                />
              </svg>
            </div>
          </div>
        )
      }

      return (
        <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-[#e8f0f7]">
          <svg viewBox="0 0 200 200" className="w-full h-full" style={{ padding: '20px' }}>
            <path
              d={gpxPath}
              fill="none"
              stroke="#366DA1"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )
    }

    return (
      <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center bg-[#c8dae8]">
        <Mountain size={32} className="text-[#366DA1]/50" />
      </div>
    )
  }

  if (media.mediaType === 'video') {
    if (videoError) {
      return (
        <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-zinc-900">
          <Loader2 size={22} className="text-white/40 animate-spin" />
          <span className="text-[11px] text-white/30">Video in elaborazione</span>
        </div>
      )
    }
    return (
      <div ref={containerRef} className="w-full h-full bg-zinc-900">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <Image
        src={r2PublicUrl(media.storageKey)}
        alt={media.altText ?? routeName}
        fill
        loading="lazy"
        className="object-cover group-hover:scale-105 transition-transform duration-300"
        // Misurato sulla produzione il 2026-09-10: la card è larga 292px a
        // 390 di viewport, 290 a 768, 356 a 900, e **313 da 1200 in su** —
        // il contenitore è `max-w-6xl`, quindi oltre quella soglia la card
        // non cresce più. Le unità `vw` sono lo strumento sbagliato lì: il
        // vecchio `33vw` chiedeva 1920px per una card da 313, e `100vw` sotto
        // i 768 ne chiedeva 1920 per una da 290. Sei volte il necessario.
        sizes="(max-width: 639px) calc(100vw - 96px), (max-width: 1023px) calc((100vw - 184px) / 2), 340px"
        // Una miniatura resa a 313px non ha bisogno della qualità di una foto
        // a piena pagina, e Lighthouse indicava la compressione come il primo
        // risparmio dopo le dimensioni.
        quality={68}
      />
    </div>
  )
}
