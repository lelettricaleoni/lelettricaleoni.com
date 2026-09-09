'use client'
import { useEffect, useRef } from 'react'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'

/**
 * Video.js player for the route videos.
 *
 * Video.js bundles @videojs/http-streaming, so it plays the HLS streams
 * directly and hls.js is not needed here.
 *
 * Sized to fill its container rather than sitting at the intrinsic video size,
 * which is what left the old `<video>` element small and marooned in the middle
 * of the lightbox. The fullscreen button is removed on purpose: inside a
 * lightbox that already covers the screen it does nothing a viewer wants.
 */
export function VideoPlayer({
  src,
  active,
  onError,
}: {
  src: string
  /** Whether this player is the one on screen. Adjacent lightbox slides stay mounted. */
  active: boolean
  onError?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  // Held in a ref so a changing callback never tears down the player
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    if (!containerRef.current || playerRef.current) return

    // Video.js replaces the element it is handed, so give it a fresh one
    const el = document.createElement('video-js')
    el.classList.add('vjs-big-play-centered')
    containerRef.current.appendChild(el)

    const player = videojs(el, {
      controls: true,
      preload: 'auto',
      playsinline: true,
      fill: true,
      responsive: true,
      controlBar: {
        // Redundant inside a lightbox that already covers the screen
        fullscreenToggle: false,
        pictureInPictureToggle: false,
      },
      sources: [{ src, type: 'application/x-mpegURL' }],
    })

    player.on('error', () => onErrorRef.current?.())
    playerRef.current = player

    return () => {
      playerRef.current?.dispose()
      playerRef.current = null
    }
  }, [src])

  // Play only the slide on screen; the others stay mounted but silent
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (active) {
      const started = player.play()
      if (started) started.catch(() => { /* autoplay refused: the viewer can press play */ })
    } else {
      player.pause()
    }
  }, [active])

  return <div ref={containerRef} className="w-full h-full" data-vjs-player />
}
