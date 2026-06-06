'use client'
import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Lightbox from 'yet-another-react-lightbox'
import 'yet-another-react-lightbox/styles.css'
import Zoom from 'yet-another-react-lightbox/plugins/zoom'
import Hls from 'hls.js'
import { Loader2 } from 'lucide-react'
import { r2PublicUrl } from '@/lib/r2'
import { minioHlsUrl } from '@/lib/minio-client'
import type { Slide } from 'yet-another-react-lightbox'
import type { RoutePhoto } from '@/lib/db'

interface HlsSlide {
  type: 'hls'
  hlsUrl: string
}

// Register custom HLS slide type with YARL's type system
declare module 'yet-another-react-lightbox' {
  interface SlideTypes {
    hls: HlsSlide
  }
}

/** Autoplay muted HLS video for thumbnail cells (first 3 grid positions). */
function VideoThumbAutoplay({ hlsUrl }: { hlsUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || !videoRef.current) return
    let hls: Hls | null = null
    if (Hls.isSupported()) {
      hls = new Hls({ startLevel: -1 })
      hls.loadSource(hlsUrl)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(true) })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl
      videoRef.current.onerror = () => setError(true)
    } else {
      setError(true)
    }
    return () => hls?.destroy()
  }, [hlsUrl, visible])

  if (error) {
    return (
      <div ref={containerRef} className="absolute inset-0 flex items-center justify-center bg-zinc-900">
        <Loader2 size={20} className="text-white/40 animate-spin" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="absolute inset-0 bg-zinc-900">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        className="w-full h-full object-cover"
      />
    </div>
  )
}

/** Full HLS video player rendered inside the YARL lightbox.
 *  `active` (offset===0) controls play/pause — YARL keeps adjacent slides mounted. */
function HlsVideoSlide({ hlsUrl, active }: { hlsUrl: string; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!videoRef.current) return
    let hls: Hls | null = null
    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(hlsUrl)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setError(true) })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = hlsUrl
      videoRef.current.onerror = () => setError(true)
    } else {
      setError(true)
    }
    return () => hls?.destroy()
  }, [hlsUrl])

  // Play only when this slide is the active one; pause otherwise
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active) {
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [active])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 w-full h-full">
        <Loader2 size={32} className="text-white/40 animate-spin" />
        <span className="text-sm text-white/40">Video in elaborazione</span>
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      controls
      className="max-h-[90vh] max-w-full rounded"
      style={{ aspectRatio: '16/9', background: '#000' }}
    />
  )
}

function MediaThumb({
  item,
  index,
  autoplay,
  routeName,
  onOpen,
  className,
  priority,
  sizes,
  extraLabel,
}: {
  item: RoutePhoto
  index: number
  autoplay: boolean
  routeName: string
  onOpen: (i: number) => void
  className?: string
  priority?: boolean
  sizes?: string
  extraLabel?: string
}) {
  return (
    <button
      onClick={() => onOpen(index)}
      className={`relative overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer ${className ?? ''}`}
    >
      {item.mediaType === 'video' ? (
        autoplay ? (
          <VideoThumbAutoplay hlsUrl={minioHlsUrl(item.storageKey)} />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )
      ) : (
        <Image
          src={r2PublicUrl(item.storageKey)}
          alt={item.altText ?? `${routeName} foto ${index + 1}`}
          fill
          priority={priority}
          className="object-cover"
          sizes={sizes ?? '(max-width: 768px) 100vw, 50vw'}
        />
      )}
      {extraLabel && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-2xl font-bold">
          {extraLabel}
        </span>
      )}
    </button>
  )
}

export function RouteGallery({ media, routeName }: { media: RoutePhoto[]; routeName: string }) {
  const [lightboxIndex, setLightboxIndex] = useState(-1)

  if (media.length === 0) return null

  const slides: Slide[] = media.map((m) =>
    m.mediaType === 'video'
      ? ({ type: 'hls' as const, hlsUrl: minioHlsUrl(m.storageKey) } satisfies HlsSlide)
      : { src: r2PublicUrl(m.storageKey), alt: m.altText ?? `${routeName}` }
  )

  return (
    <>
      {media.length === 1 && (
        <MediaThumb
          item={media[0]}
          index={0}
          autoplay
          routeName={routeName}
          onOpen={setLightboxIndex}
          className="w-full aspect-video rounded-xl"
          priority
          sizes="(max-width: 640px) calc(100vw - 6rem), (max-width: 1152px) calc(100vw - 10rem), 992px"
        />
      )}

      {media.length === 2 && (
        <div className="grid grid-cols-2 gap-2 h-64 sm:h-80">
          {media.map((item, i) => (
            <MediaThumb
              key={item.id}
              item={item}
              index={i}
              autoplay
              routeName={routeName}
              onOpen={setLightboxIndex}
              className={i === 0 ? 'rounded-l-xl' : 'rounded-r-xl'}
              priority={i === 0}
              sizes="50vw"
            />
          ))}
        </div>
      )}

      {media.length >= 3 && (
        <div className="grid grid-cols-3 grid-rows-2 gap-2 h-64 sm:h-80">
          <MediaThumb
            item={media[0]}
            index={0}
            autoplay
            routeName={routeName}
            onOpen={setLightboxIndex}
            className="col-span-2 row-span-2 rounded-l-xl"
            priority
            sizes="(max-width: 768px) 66vw, 50vw"
          />
          <MediaThumb
            item={media[1]}
            index={1}
            autoplay
            routeName={routeName}
            onOpen={setLightboxIndex}
            className="rounded-tr-xl"
            sizes="(max-width: 768px) 34vw, 25vw"
          />
          <MediaThumb
            item={media[2]}
            index={2}
            autoplay
            routeName={routeName}
            onOpen={setLightboxIndex}
            className="rounded-br-xl"
            sizes="(max-width: 768px) 34vw, 25vw"
            extraLabel={media.length > 3 ? `+${media.length - 3}` : undefined}
          />
        </div>
      )}

      <Lightbox
        open={lightboxIndex >= 0}
        index={lightboxIndex}
        close={() => setLightboxIndex(-1)}
        slides={slides}
        plugins={[Zoom]}
        render={{
          slide: ({ slide, offset }) => {
            if (slide.type !== 'hls') return undefined
            return <HlsVideoSlide hlsUrl={slide.hlsUrl} active={offset === 0} />
          },
        }}
      />
    </>
  )
}
