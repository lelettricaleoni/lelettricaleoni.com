'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Play } from 'lucide-react'
import { MediaViewer } from '@/components/media-viewer'
import { r2PublicUrl } from '@/lib/r2'
import type { RoutePhoto } from '@/lib/db'

function MediaThumb({
  item,
  index,
  routeName,
  onOpen,
  className,
  priority,
  sizes,
}: {
  item: RoutePhoto
  index: number
  routeName: string
  onOpen: (i: number) => void
  className?: string
  priority?: boolean
  sizes?: string
}) {
  return (
    <button
      onClick={() => onOpen(index)}
      className={`relative overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer ${className ?? ''}`}
    >
      {item.mediaType === 'video' ? (
        <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
          <Play size={40} className="text-white/80 drop-shadow-lg" fill="currentColor" />
        </div>
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
    </button>
  )
}

export function RouteGallery({ media, routeName }: { media: RoutePhoto[]; routeName: string }) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)

  if (media.length === 0) return null

  return (
    <>
      {media.length === 1 && (
        <MediaThumb
          item={media[0]}
          index={0}
          routeName={routeName}
          onOpen={setViewerIndex}
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
              routeName={routeName}
              onOpen={setViewerIndex}
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
            routeName={routeName}
            onOpen={setViewerIndex}
            className="col-span-2 row-span-2 rounded-l-xl"
            priority
            sizes="(max-width: 768px) 66vw, 50vw"
          />
          <MediaThumb
            item={media[1]}
            index={1}
            routeName={routeName}
            onOpen={setViewerIndex}
            className="rounded-tr-xl"
            sizes="(max-width: 768px) 34vw, 25vw"
          />
          <button
            onClick={() => setViewerIndex(2)}
            className="relative rounded-br-xl overflow-hidden bg-muted hover:opacity-90 transition-opacity focus-visible:ring-2 ring-[#366DA1] outline-none cursor-pointer"
          >
            {media[2].mediaType === 'video' ? (
              <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                <Play size={28} className="text-white/80 drop-shadow-lg" fill="currentColor" />
              </div>
            ) : (
              <Image
                src={r2PublicUrl(media[2].storageKey)}
                alt={media[2].altText ?? `${routeName} foto 3`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 34vw, 25vw"
              />
            )}
            {media.length > 3 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-2xl font-bold">
                +{media.length - 3}
              </span>
            )}
          </button>
        </div>
      )}

      {viewerIndex !== null && (
        <MediaViewer
          media={media}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={setViewerIndex}
        />
      )}
    </>
  )
}
