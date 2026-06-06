'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Hls from 'hls.js'
import { Mountain } from 'lucide-react'
import { r2PublicUrl } from '@/lib/r2'
import { minioHlsUrl } from '@/lib/minio-client'
import type { RoutePhoto } from '@/lib/db'

interface RouteCardMediaProps {
  media?: RoutePhoto
  gpxPath?: string
  routeName: string
}

export function RouteCardMedia({ media, gpxPath, routeName }: RouteCardMediaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => setIsVisible(e.isIntersecting), { threshold: 0.1 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!media || media.mediaType !== 'video' || !videoRef.current || !isVisible) return
    const hlsUrl = minioHlsUrl(media.storageKey)
    let hls: Hls | null = null
    if (Hls.isSupported()) {
      hls = new Hls({ startLevel: -1 })
      hls.loadSource(hlsUrl)
      hls.attachMedia(videoRef.current)
    } else {
      videoRef.current.src = hlsUrl
    }
    return () => hls?.destroy()
  }, [media, isVisible])

  if (!media) {
    if (gpxPath) {
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
    return (
      <div ref={containerRef} className="w-full h-full bg-black">
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
    <div ref={containerRef} className="w-full h-full">
      <Image
        src={r2PublicUrl(media.storageKey)}
        alt={media.altText ?? routeName}
        fill
        loading="lazy"
        className="object-cover group-hover:scale-105 transition-transform duration-300"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
      />
    </div>
  )
}
