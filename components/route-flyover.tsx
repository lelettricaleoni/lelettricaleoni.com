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

export function RouteFlyover({ points }: { points: Coord[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumType>(null)
  const cesiumRef = useRef<CesiumType>(null)  // cache del modulo Cesium
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
        // Aspetta che il container abbia dimensioni reali prima di inizializzare Cesium
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

        window.CESIUM_BASE_URL = '/cesium'

        if (!document.querySelector('#cesium-css')) {
          const link = document.createElement('link')
          link.id = 'cesium-css'
          link.rel = 'stylesheet'
          link.href = '/cesium/Widgets/widgets.css'
          document.head.appendChild(link)
        }

        // Cesium caricato via script tag per evitare bundling webpack (octal escape in GLSL)
        await new Promise<void>((resolve, reject) => {
          if (window.Cesium) return resolve()
          const existing = document.querySelector('#cesium-js')
          if (existing) {
            existing.addEventListener('load', () => resolve(), { once: true })
            existing.addEventListener('error', () => reject(new Error('Cesium.js load failed')), { once: true })
            return
          }
          const script = document.createElement('script')
          script.id = 'cesium-js'
          script.src = '/cesium/Cesium.js'
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Cesium.js load failed'))
          document.head.appendChild(script)
        })
        const Cesium: CesiumType = window.Cesium
        if (destroyed || !containerRef.current) return

        cesiumRef.current = Cesium  // cache per startFlyover / stopFlyover

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

        // Traccia del percorso
        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
              points.flatMap(([lon, lat, ele]) => [lon, lat, ele + 3])
            ),
            width: 4,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.2,
              color: Cesium.Color.fromCssColorString('#795F91'),
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
        color: Cesium.Color.fromCssColorString('#795F91'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    entityRef.current = entity

    // Camera manuale ogni frame — nessun jerk da trackedEntity
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
