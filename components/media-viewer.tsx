'use client'
import { useEffect, useRef } from 'react'
import Image from 'next/image'
import Hls from 'hls.js'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { r2PublicUrl } from '@/lib/r2'
import { minioHlsUrl } from '@/lib/minio-client'
import type { RoutePhoto } from '@/lib/db'

interface MediaViewerProps {
  media: RoutePhoto[]
  index: number
  onClose: () => void
  onNavigate: (i: number) => void
}

export function MediaViewer({ media, index, onClose, onNavigate }: MediaViewerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const current = media[index]

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1)
      if (e.key === 'ArrowRight' && index < media.length - 1) onNavigate(index + 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [index, media.length, onClose, onNavigate])

  useEffect(() => {
    if (!current || current.mediaType !== 'video' || !videoRef.current) return
    let hls: Hls | null = null
    const hlsUrl = minioHlsUrl(current.storageKey)
    if (Hls.isSupported()) {
      hls = new Hls()
      hls.loadSource(hlsUrl)
      hls.attachMedia(videoRef.current)
    } else {
      videoRef.current.src = hlsUrl
    }
    return () => hls?.destroy()
  }, [current])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 text-white/70 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition-colors"
        onClick={onClose}
        aria-label="Chiudi"
      >
        <X size={24} />
      </button>

      {index > 0 && (
        <button
          className="absolute left-3 sm:left-4 text-white/70 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1) }}
          aria-label="Precedente"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {index < media.length - 1 && (
        <button
          className="absolute right-3 sm:right-4 text-white/70 hover:text-white z-10 p-2 rounded-full hover:bg-white/10 transition-colors"
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1) }}
          aria-label="Successivo"
        >
          <ChevronRight size={32} />
        </button>
      )}

      <div
        className="w-full max-w-5xl max-h-[90vh] px-14 sm:px-20"
        onClick={(e) => e.stopPropagation()}
      >
        {current.mediaType === 'video' ? (
          <video
            ref={videoRef}
            controls
            autoPlay
            className="w-full max-h-[85vh] object-contain rounded-lg"
          />
        ) : (
          <div className="relative w-full max-h-[85vh] aspect-video">
            <Image
              src={r2PublicUrl(current.storageKey)}
              alt={current.altText ?? ''}
              fill
              className="object-contain"
              sizes="(max-width: 1024px) 100vw, 1024px"
              priority
            />
          </div>
        )}
      </div>

      {media.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
          {media.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); onNavigate(i) }}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/30 hover:bg-white/60'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
