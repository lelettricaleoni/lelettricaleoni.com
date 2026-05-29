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

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => { setIndex(i); setOpen(true) }}
            className="relative aspect-video rounded-lg overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none"
          >
            <Image
              src={r2PublicUrl(photo.storageKey)}
              alt={photo.altText ?? `${routeName} foto ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 50vw, 33vw"
            />
          </button>
        ))}
      </div>

      <Lightbox
        open={open}
        close={() => setOpen(false)}
        index={index}
        slides={slides}
      />
    </>
  )
}
