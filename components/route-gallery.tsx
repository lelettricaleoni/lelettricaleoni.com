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
          className="relative w-full aspect-video rounded-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer"
        >
          <Image
            src={r2PublicUrl(photos[0].storageKey)}
            alt={photos[0].altText ?? `${routeName} foto 1`}
            fill priority className="object-cover"
            sizes="(max-width: 640px) calc(100vw - 6rem), (max-width: 1152px) calc(100vw - 10rem), 992px"
          />
        </button>
      )}

      {photos.length === 2 && (
        <div className="grid grid-cols-2 gap-2 h-64 sm:h-80">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => openAt(i)}
              className={`relative overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer ${i === 0 ? 'rounded-l-xl' : 'rounded-r-xl'}`}
            >
              <Image
                src={r2PublicUrl(photo.storageKey)}
                alt={photo.altText ?? `${routeName} foto ${i + 1}`}
                fill priority={i === 0} className="object-cover"
                sizes="50vw"
              />
            </button>
          ))}
        </div>
      )}

      {photos.length >= 3 && (
        <div className="grid grid-cols-3 grid-rows-2 gap-2 h-64 sm:h-80">
          {/* Prima foto — grande, 2 colonne × 2 righe */}
          <button
            onClick={() => openAt(0)}
            className="col-span-2 row-span-2 relative rounded-l-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer"
          >
            <Image
              src={r2PublicUrl(photos[0].storageKey)}
              alt={photos[0].altText ?? `${routeName} foto 1`}
              fill priority className="object-cover"
              sizes="(max-width: 768px) 66vw, 50vw"
            />
          </button>
          {/* Seconda foto */}
          <button
            onClick={() => openAt(1)}
            className="relative rounded-tr-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer"
          >
            <Image
              src={r2PublicUrl(photos[1].storageKey)}
              alt={photos[1].altText ?? `${routeName} foto 2`}
              fill className="object-cover"
              sizes="(max-width: 768px) 34vw, 25vw"
            />
          </button>
          {/* Terza foto — con overlay +N se ci sono altre */}
          <button
            onClick={() => openAt(2)}
            className="relative rounded-br-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer"
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
