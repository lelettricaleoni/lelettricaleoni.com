'use client'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Hls from 'hls.js'
import { hlsUrl, photoUrl, lowestBitrateLevel, type MediaWithHls } from '@/lib/media-client'
import { photoLoader } from '@/lib/photo-loader'
import { MediaPlaceholder } from '@/components/media-placeholder'
import { usePreviewMode } from './route-preview-mode'

interface MapCenter { lat: number; lon: number; zoom: number }

// No subscription needed: this never changes after the first client render,
// it only ever tells React "server snapshot" vs "client snapshot" once.
const noopSubscribe = () => () => {}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#22c55e',
  medium: '#eab308',
  hard:   '#f97316',
  expert: '#ef4444',
}

interface CardMediaProps {
  media?: MediaWithHls
  gpxPath?: string
  mapCenter?: MapCenter
  difficulty?: string | null
  title: string
}

function latLonToTileXY(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const xFloat = (lon + 180) / 360 * n
  const sinLat = Math.sin(lat * Math.PI / 180)
  const cosLat = Math.cos(lat * Math.PI / 180)
  const yFloat = (1 - Math.log((1 + sinLat) / cosLat) / Math.PI) / 2 * n
  return { x: Math.floor(xFloat), y: Math.floor(yFloat), fracX: xFloat % 1, fracY: yFloat % 1 }
}

export function CardMedia({ media, gpxPath, mapCenter, difficulty, title }: CardMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [videoError, setVideoError] = useState(false)
  // A <video> element paints black until its first frame decodes, no matter
  // what the container behind it is styled with — so the loader has to sit
  // on top of the video, not behind it, and disappear once playback truly
  // starts rather than once the element merely mounts.
  const [videoReady, setVideoReady] = useState(false)
  // Same idea for a photo: Next/Image has nothing to paint until it decodes,
  // so the placeholder covers that gap too instead of leaving a blank box.
  const [photoReady, setPhotoReady] = useState(false)
  // Tiles are client-only to avoid SSR/hydration mismatch. useSyncExternalStore
  // reports false for the server-rendered/hydration pass and true right after,
  // through React's own hydration mechanism — no setState-in-effect render
  // cascade the way a useState+useEffect mount flag causes.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)

  // A video that reaches this component already passed the server's check
  // that its manifest exists (lib/media.ts resolveHlsUrl, cached 7 days since
  // a manifest never moves once written) — so a playback failure here is
  // never "still processing", it's storage being unreachable right now, or a
  // genuinely broken stream. Treated exactly like having no media at all,
  // same as the fallback below: falls back to the map/mountain icon instead
  // of getting stuck on a spinner that falsely promises it's coming.
  const mediaFailed = media?.mediaType === 'video' && videoError

  // The list-wide toggle's preferred type wins when this route has it; a
  // route missing what the toggle asks for falls back to the other type
  // instead of going blank, and only shows the mountain icon when it has
  // neither. Mirrors the choice for cards that have never had a photo: never
  // punish a route for missing the thing nobody is asking to see right now.
  const preferMap = usePreviewMode() === 'map'
  const showMap = Boolean(gpxPath) && (preferMap || !media || mediaFailed)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    // showMap is in the dependency array on purpose, even though the guard
    // below doesn't read it: switching to the map view unmounts <video> without
    // this effect's cleanup ever running, since neither `media` nor `isVisible`
    // changes when only the toggle does. The next switch back then attaches to
    // a stale, already-destroyed hls.js instance — a black video that never
    // starts. Listing showMap here makes React tear down and rebuild on every
    // crossing, not just on the two dependencies that used to be the whole story.
    if (!media || media.mediaType !== 'video' || !videoRef.current || !isVisible || showMap) return
    const src = media.hlsUrl ?? hlsUrl(media.storageKey)
    let hls: Hls | null = null
    setVideoError(false)
    setVideoReady(false)

    if (Hls.isSupported()) {
      hls = new Hls()
      // Small, muted, looping preview: never worth waiting on hls.js's
      // bandwidth guess, which starts optimistic and shows the loading
      // spinner longer than it needs to while it steps down.
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const lowest = lowestBitrateLevel(data.levels)
        hls!.startLevel = lowest
        hls!.loadLevel = lowest
      })
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
  }, [media, isVisible, showMap])

  if (showMap && gpxPath) {
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

  if (!media || mediaFailed) {
    return (
      <div ref={containerRef} className="relative w-full h-full">
        <MediaPlaceholder />
      </div>
    )
  }

  if (media.mediaType === 'video') {
    return (
      <div ref={containerRef} className="relative w-full h-full bg-zinc-900">
        {!videoReady && <MediaPlaceholder pulse />}
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          onPlaying={() => setVideoReady(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {!photoReady && <MediaPlaceholder pulse />}
      <Image
        src={photoUrl(media.storageKey)}
        loader={photoLoader}
        alt={media.altText ?? title}
        fill
        loading="lazy"
        onLoad={() => setPhotoReady(true)}
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
