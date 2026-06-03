'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Square } from 'lucide-react'

type Coord = [number, number, number] // [lon, lat, ele]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumType = any

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { CESIUM_BASE_URL: string; Cesium: any }
}

const CESIUM_VERSION = '1.141.0'
const CESIUM_CDN = `https://unpkg.com/cesium@${CESIUM_VERSION}/Build/Cesium`

// Module-level state machine — handles concurrent mounts and retries cleanly
type LoadState = 'idle' | 'loading' | 'loaded'
let cesiumLoadState: LoadState = 'idle'
const cesiumLoadCallbacks: Array<{ resolve: () => void; reject: (e: Error) => void }> = []

function loadCesiumScript(): Promise<void> {
  if (cesiumLoadState === 'loaded' || window.Cesium) return Promise.resolve()
  return new Promise((resolve, reject) => {
    cesiumLoadCallbacks.push({ resolve, reject })
    if (cesiumLoadState === 'loading') return
    cesiumLoadState = 'loading'
    const script = document.createElement('script')
    script.id = 'cesium-js'
    script.src = `${CESIUM_CDN}/Cesium.js`
    script.onload = () => {
      cesiumLoadState = 'loaded'
      cesiumLoadCallbacks.splice(0).forEach((cb) => cb.resolve())
    }
    script.onerror = () => {
      cesiumLoadState = 'idle'
      script.remove()
      const err = new Error('Cesium.js load failed')
      cesiumLoadCallbacks.splice(0).forEach((cb) => cb.reject(err))
    }
    document.head.appendChild(script)
  })
}

const DIFFICULTY_COLORS: Record<string, string> = {
  easy:   '#22c55e',
  medium: '#eab308',
  hard:   '#f97316',
  expert: '#ef4444',
}

export function RouteFlyover({ points, difficulty }: { points: Coord[]; difficulty?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumType>(null)
  const cesiumRef = useRef<CesiumType>(null)  // cached Cesium module
  const entityRef = useRef<CesiumType>(null)
  const cameraHandlerRef = useRef<CesiumType>(null)
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return
    let destroyed = false

    ;(async () => {
      try {
        // Wait for the container to have real dimensions before initializing Cesium
        await new Promise<void>((resolve) => {
          if (!containerRef.current) return resolve()
          if (containerRef.current.clientHeight > 0) return resolve()
          const ro = new ResizeObserver(() => {
            if (containerRef.current && containerRef.current.clientHeight > 0) {
              ro.disconnect()
              resolve()
            }
          })
          ro.observe(containerRef.current)
        })

        window.CESIUM_BASE_URL = `${CESIUM_CDN}/`

        if (!document.querySelector('#cesium-css')) {
          const link = document.createElement('link')
          link.id = 'cesium-css'
          link.rel = 'stylesheet'
          link.href = `${CESIUM_CDN}/Widgets/widgets.css`
          document.head.appendChild(link)
        }

        // Cesium loaded via script tag to avoid webpack bundling (octal escapes in GLSL shaders)
        await loadCesiumScript()
        const Cesium: CesiumType = window.Cesium
        if (destroyed || !containerRef.current) return

        cesiumRef.current = Cesium  // cached for startFlyover / stopFlyover

        const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN
        if (token) Cesium.Ion.defaultAccessToken = token

        const esriImagery = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
        )

        let terrainProvider
        if (token) {
          try { terrainProvider = await Cesium.CesiumTerrainProvider.fromIonAssetId(1) } catch { /* no terrain */ }
        }

        const viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: new Cesium.ImageryLayer(esriImagery),
          terrainProvider,
          timeline: false,
          animation: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          geocoder: false,
          baseLayerPicker: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          creditContainer: document.createElement('div'),
        })

        const trackColor = DIFFICULTY_COLORS[difficulty ?? ''] ?? '#795F91'

        // Route track polyline
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
              points.flatMap(([lon, lat, ele]) => [lon, lat, ele + 3])
            ),
            width: 5,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Cesium.Color.fromCssColorString(trackColor),
            }),
          },
        })

        const positions = points.map(([lon, lat, ele]) =>
          Cesium.Cartesian3.fromDegrees(lon, lat, ele)
        )
        viewer.camera.flyToBoundingSphere(
          Cesium.BoundingSphere.fromPoints(positions),
          { duration: 1.5, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 0) }
        )

        viewer.resolutionScale = window.devicePixelRatio
        viewerRef.current = viewer
        requestAnimationFrame(() => {
          if (!destroyed) {
            viewer.resize()
            setReady(true)
          }
        })
      } catch (err) {
        if (destroyed) return
        console.error('Cesium init error:', err)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      destroyed = true
      cameraHandlerRef.current?.()
      cameraHandlerRef.current = null
      viewerRef.current?.destroy()
      viewerRef.current = null
      cesiumRef.current = null
    }
  }, [points])

  function startFlyover() {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium || points.length < 2) return
    setFlying(true)

    const DURATION_S = 60
    const start = Cesium.JulianDate.now()
    const stop = Cesium.JulianDate.addSeconds(start, DURATION_S, new Cesium.JulianDate())

    viewer.clock.startTime = start.clone()
    viewer.clock.stopTime = stop.clone()
    viewer.clock.currentTime = start.clone()
    viewer.clock.clockRange = Cesium.ClockRange.CLAMPED
    viewer.clock.multiplier = 1

    const pos = new Cesium.SampledPositionProperty()
    pos.setInterpolationOptions({
      interpolationDegree: 3,
      interpolationAlgorithm: Cesium.HermitePolynomialApproximation,
    })
    points.forEach(([lon, lat, ele], i) => {
      const t = Cesium.JulianDate.addSeconds(start, (i / (points.length - 1)) * DURATION_S, new Cesium.JulianDate())
      pos.addSample(t, Cesium.Cartesian3.fromDegrees(lon, lat, ele + 5))
    })

    if (entityRef.current) viewer.entities.remove(entityRef.current)
    const entity = viewer.entities.add({
      availability: new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })]),
      position: pos,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(DIFFICULTY_COLORS[difficulty ?? ''] ?? '#795F91'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    entityRef.current = entity

    // Manual camera update every frame — no jerk from trackedEntity
    const offset = new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), 3000)
    cameraHandlerRef.current = viewer.scene.postUpdate.addEventListener((_scene: unknown, time: CesiumType) => {
      const currentPos = pos.getValue(time, new Cesium.Cartesian3())
      if (currentPos) viewer.camera.lookAt(currentPos, offset)
    })

    viewer.clock.shouldAnimate = true

    const rm = viewer.clock.onStop.addEventListener(() => {
      setFlying(false)
      cameraHandlerRef.current?.()
      cameraHandlerRef.current = null
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
      rm()
    })
  }

  function stopFlyover() {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return
    viewer.clock.shouldAnimate = false
    cameraHandlerRef.current?.()
    cameraHandlerRef.current = null
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    setFlying(false)
    const positions = points.map(([lon, lat, ele]) => Cesium.Cartesian3.fromDegrees(lon, lat, ele))
    viewer.camera.flyToBoundingSphere(
      Cesium.BoundingSphere.fromPoints(positions),
      { duration: 1.5, offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-40), 0) }
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-72 sm:h-[420px] rounded-xl border border-border bg-muted text-sm text-muted-foreground px-4 text-center">
        Mappa 3D non disponibile: {error}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden border border-border">
        <div
          ref={containerRef}
          className="w-full h-72 sm:h-[420px]"
          style={{ position: 'relative', display: 'block' }}
        />
      </div>
      {ready && (
        <div className="flex justify-center">
          <button
            onClick={flying ? stopFlyover : startFlyover}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#366DA1] text-[#366DA1] bg-white text-sm font-semibold shadow-sm hover:bg-[#366DA1] hover:text-white transition-colors"
          >
            {flying ? (
              <>
                <Square size={15} className="fill-current" />
                Stop flyover
              </>
            ) : (
              <>
                <Play size={15} className="fill-current" />
                Flyover 3D
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
