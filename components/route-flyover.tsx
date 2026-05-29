'use client'
import { useEffect, useRef, useState } from 'react'

type Coord = [number, number, number] // [lon, lat, ele]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumType = any

declare global {
  interface Window { CESIUM_BASE_URL: string }
}

export function RouteFlyover({ points }: { points: Coord[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumType>(null)
  const cesiumRef = useRef<CesiumType>(null)  // cache del modulo Cesium
  const entityRef = useRef<CesiumType>(null)
  const cameraHandlerRef = useRef<CesiumType>(null)
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)

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

        // Cesium usa named exports — import('cesium').default è undefined con webpack
        const mod = await import('cesium')
        const Cesium: CesiumType = mod.default ?? mod
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

        viewerRef.current = viewer
        // Aspetta il prossimo frame di rendering prima di ridimensionare
        // (il browser deve aver applicato height:100% al .cesium-widget)
        requestAnimationFrame(() => {
          if (!destroyed) {
            viewer.resize()
            setReady(true)
          }
        })
      } catch (err) {
        console.error('Cesium init error:', err)
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

  return (
    <div className="relative rounded-xl overflow-hidden border border-border isolate">
      <div
        ref={containerRef}
        className="w-full h-72 sm:h-[420px]"
        style={{ position: 'relative', display: 'block' }}
      />
      {ready && (
        <button
          onClick={flying ? stopFlyover : startFlyover}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 shadow-md text-sm font-medium text-white hover:bg-black/80 transition-colors backdrop-blur-sm"
        >
          {flying ? '⏹ Stop' : '▶ Flyover 3D'}
        </button>
      )}
    </div>
  )
}
