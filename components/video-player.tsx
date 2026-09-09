'use client'
import { useEffect, useRef } from 'react'
import { VideoPlayer as VjsPlayer, VideoSkin } from '@videojs/react/video'
import { HlsJsVideo } from '@videojs/react/media/hlsjs-video'
import '@videojs/react/video/skin.css'

/**
 * Video.js v10 player for the route videos.
 *
 * v10 is a ground-up rewrite of Video.js, published as @videojs/react and
 * currently at 10.0.0-rc.1 — a release candidate, not a stable release. The
 * player is composed rather than configured: a player shell, a skin, and a
 * media provider. HLS comes from @videojs/hlsjs-video via the HlsJsVideo
 * component.
 *
 * Sized to fill its container rather than the video's intrinsic size, which is
 * what left the old bare <video> small and marooned in the middle of the
 * lightbox.
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
  const videoRef = useRef<HTMLVideoElement>(null)

  // Play only the slide on screen; the others stay mounted but silent
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active) {
      video.play().catch(() => { /* autoplay refused: the viewer can press play */ })
    } else {
      video.pause()
    }
  }, [active])

  // VideoPlayer takes no className of its own, so sizing lives on a wrapper.
  //
  // Fullscreen, picture-in-picture and cast are hidden rather than configured
  // away: the skin exposes no props for it, and inside a lightbox that already
  // covers the screen none of the three does anything a viewer wants.
  //
  // .video-controls-backdrop is the scrim the skin paints over the video when
  // the control bar appears, darkening the picture you came to watch. Hiding
  // the element rather than blanking --media-controls-gradient, because the
  // skin redefines that variable further down the tree than we can reach.
  return (
    <div
      className="w-full h-full
        [&_.video-controls-backdrop]:hidden
        [&_video]:w-full [&_video]:h-full [&_video]:object-contain
        [&_.media-fullscreen-button]:hidden
        [&_.media-pip-button]:hidden
        [&_.media-cast-button]:hidden"
    >
      <VjsPlayer>
        <VideoSkin>
          <HlsJsVideo
            ref={videoRef}
            src={src}
            playsInline
            // Only the slide on screen preloads aggressively. The lightbox
            // keeps neighbouring slides mounted, so "auto" everywhere meant
            // several HLS engines pulling segments at once, competing with the
            // autoplaying thumbnails behind the lightbox.
            preload={active ? 'auto' : 'metadata'}
            onError={onError}
          />
        </VideoSkin>
      </VjsPlayer>
    </div>
  )
}
