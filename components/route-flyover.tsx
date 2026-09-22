'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { Play, Square, ChevronDown } from 'lucide-react'
import { MapLoader } from '@/components/map-loader'
import { Skeleton } from '@/components/ui/skeleton'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { trackEvent } from '@/lib/analytics'
import { pickSampleIndices, interpolateHeights } from '@/lib/terrain'
import { cumulativeDistancesKm } from '@/lib/geo'
import { DIFFICULTY_HEX } from './difficulty-badge'

const ElevationChart = dynamic(
  () => import('./route-elevation-chart').then((m) => m.RouteElevationChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> }
)

type Coord = [number, number, number] // [lon, lat, ele]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CesiumType = any

declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { CESIUM_BASE_URL: string; Cesium: any }
}

const CESIUM_BASE = '/cesium'

// Terrain queries are batched per tile, but every sample still costs work —
// 300 across the track is plenty, since interpolateHeights fills the gaps.
const TERRAIN_SAMPLE_CAP = 300
// Metres above the terrain, enough to clear it without visibly hovering.
const TRACK_OFFSET_M = 2
const MARKER_OFFSET_M = 4

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
    script.src = `${CESIUM_BASE}/Cesium.js`
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

interface FlyoverLabels {
  toggle: string
  altitude: string
  distance: string
  duration: string
}

export function RouteFlyover({
  points, difficulty, labels, totalDistanceKm, totalDurationMin,
}: {
  points: Coord[]
  difficulty?: string
  labels: FlyoverLabels
  /** Distanza reale del percorso (stessa mostrata nella card statistiche):
   *  la distanza cumulata calcolata punto-per-punto qui viene riscalata su
   *  questo valore, altrimenti i due numeri divergono leggermente — il GPX
   *  decimato per il grafico non percorre esattamente lo stesso tracciato
   *  usato per calcolare la card. */
  totalDistanceKm?: number
  /** Durata del percorso (stessa card): usata per stimare il tempo trascorso
   *  al punto trascinato, proporzionalmente alla distanza — il GPX non ha
   *  timestamp per punto. */
  totalDurationMin?: number | null
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<CesiumType>(null)
  const cesiumRef = useRef<CesiumType>(null)
  const cursorEntityRef = useRef<CesiumType>(null)
  const cameraHandlerRef = useRef<CesiumType>(null)
  // Height to draw each track point at: terrain height where terrain is
  // available, GPX elevation otherwise. See lib/terrain.ts for why.
  const heightsRef = useRef<number[]>(points.map(([, , ele]) => ele))
  const [flying, setFlying] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chartOpen, setChartOpen] = useState(false)
  const chartCursorUpdaterRef = useRef<((index: number) => void) | null>(null)
  const infoLabelRef = useRef<HTMLSpanElement>(null)
  // Quote GPX originali — le stesse che hanno prodotto il dislivello mostrato
  // nella card statistiche. Le quote ancorate al terreno (heightsRef) restano
  // solo per posizionare l'entità Cesium sulla mappa 3D, mai per il grafico.
  const elevations = useMemo(() => points.map(([, , ele]) => ele), [points])
  const distances = useMemo(() => {
    const raw = cumulativeDistancesKm(points)
    const rawTotal = raw[raw.length - 1] || 0
    if (!totalDistanceKm || rawTotal === 0) return raw
    const scale = totalDistanceKm / rawTotal
    return raw.map((d) => d * scale)
  }, [points, totalDistanceKm])

  useEffect(() => {
    if (!containerRef.current || points.length < 2) return
    let destroyed = false
    // Reset so a previous route's terrain heights are never reused
    heightsRef.current = points.map(([, , ele]) => ele)

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

        // Must be set before loading Cesium.js so it reads the correct base path
        window.CESIUM_BASE_URL = `${CESIUM_BASE}/`

        if (!document.querySelector('#cesium-css')) {
          const link = document.createElement('link')
          link.id = 'cesium-css'
          link.rel = 'stylesheet'
          link.href = `${CESIUM_BASE}/Widgets/widgets.css`
          document.head.appendChild(link)
        }

        await loadCesiumScript()
        const Cesium: CesiumType = window.Cesium
        if (destroyed || !containerRef.current) return

        cesiumRef.current = Cesium

        const token = process.env.NEXT_PUBLIC_CESIUM_TOKEN
        if (token) Cesium.Ion.defaultAccessToken = token

        const [esriImagery, esriLabels] = await Promise.all([
          Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
          ),
          Cesium.ArcGisMapServerImageryProvider.fromUrl(
            'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer'
          ),
        ])

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

        // Labels overlay: city names, peaks, lakes, boundaries
        viewer.imageryLayers.addImageryProvider(esriLabels)

        // Re-anchor the track to the terrain. GPX elevations are above mean sea
        // level while Cesium heights are above the ellipsoid, so using them
        // directly buries the track by ~46 m here and leaves it floating where
        // the DEM dips. Falls back to GPX elevations when terrain is missing.
        if (terrainProvider) {
          try {
            const indices = pickSampleIndices(points.length, TERRAIN_SAMPLE_CAP)
            const samples = indices.map((i) =>
              Cesium.Cartographic.fromDegrees(points[i][0], points[i][1])
            )
            await Cesium.sampleTerrainMostDetailed(terrainProvider, samples)
            if (destroyed) return
            const sampled = interpolateHeights(
              points.length,
              indices,
              samples.map((c: CesiumType) => c.height)
            )
            if (sampled.length === points.length) heightsRef.current = sampled
          } catch {
            // Keep the GPX elevations — a misplaced track beats no track
          }
        }
        const heights = heightsRef.current

        const trackColor = DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'

        viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArrayHeights(
              points.flatMap(([lon, lat], i) => [lon, lat, heights[i] + TRACK_OFFSET_M])
            ),
            width: 5,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.25,
              color: Cesium.Color.fromCssColorString(trackColor),
            }),
          },
        })

        const positions = points.map(([lon, lat], i) =>
          Cesium.Cartesian3.fromDegrees(lon, lat, heights[i])
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
      // L'entità viene distrutta insieme al viewer: il riferimento va
      // invalidato qui, altrimenti un cambio di percorso (nuovo `points`)
      // riuserebbe un'entità che non esiste più.
      cursorEntityRef.current = null
    }
  }, [points])

  // Un'unica entità per volo automatico e trascinamento manuale — creata al
  // primo utilizzo, qualunque dei due arrivi per primo. Nascosta finché
  // qualcosa non la posiziona davvero.
  function ensureCursorEntity(): CesiumType {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium) return null
    if (cursorEntityRef.current) return cursorEntityRef.current
    const entity = viewer.entities.add({
      show: false,
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString(DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
    cursorEntityRef.current = entity
    return entity
  }

  // Aggiorna solo il cursore del grafico e l'etichetta quota/distanza — mai
  // l'entità Cesium: durante il volo la posizione dell'entità è già guidata
  // da `pos` (SampledPositionProperty), impostarla di nuovo qui sarebbe
  // ridondante. Chiamata sia dal loop del volo sia da updateCursorAt sotto.
  function updateChartCursor(index: number) {
    chartCursorUpdaterRef.current?.(index)
    if (infoLabelRef.current) {
      const alt = Math.round(elevations[index])
      const dist = distances[index].toFixed(1)
      const parts = [`${labels.altitude}: ${alt} m`, `${labels.distance}: ${dist} km`]
      if (totalDurationMin) {
        const totalDist = distances[distances.length - 1] || 1
        const estMin = Math.round((distances[index] / totalDist) * totalDurationMin)
        const h = Math.floor(estMin / 60)
        const m = estMin % 60
        parts.push(`${labels.duration}: ${h > 0 ? `${h}h` : ''}${m}m`)
      }
      infoLabelRef.current.textContent = parts.join(' · ')
    }
  }

  // Solo trascinamento manuale: sposta anche l'entità Cesium a un punto
  // statico (nessun volo in corso, quindi nessuna SampledPositionProperty a
  // possederne la posizione).
  function updateCursorAt(index: number) {
    const Cesium = cesiumRef.current
    const entity = ensureCursorEntity()
    if (!Cesium || !entity) return
    const [lon, lat] = points[index]
    entity.availability = undefined
    entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, heightsRef.current[index] + MARKER_OFFSET_M)
    entity.show = true
    updateChartCursor(index)
  }

  function handleScrubStart() {
    if (flying) stopFlyover()
  }

  // No-op deliberato: il cursore resta dov'è al rilascio, non torna
  // all'inizio — vedi lo spec.
  function handleScrubEnd() {}

  function startFlyover() {
    const viewer = viewerRef.current
    const Cesium = cesiumRef.current
    if (!viewer || !Cesium || points.length < 2) return
    setFlying(true)
    trackEvent('flyover_start')

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
    const heights = heightsRef.current
    points.forEach(([lon, lat], i) => {
      const t = Cesium.JulianDate.addSeconds(start, (i / (points.length - 1)) * DURATION_S, new Cesium.JulianDate())
      pos.addSample(t, Cesium.Cartesian3.fromDegrees(lon, lat, heights[i] + MARKER_OFFSET_M))
    })

    const entity = ensureCursorEntity()
    entity.availability = new Cesium.TimeIntervalCollection([new Cesium.TimeInterval({ start, stop })])
    entity.position = pos
    entity.show = true

    // Initialize heading from the first segment so the camera starts already oriented
    const toRad = Cesium.Math.toRadians
    const lon0 = toRad(points[0][0]), lat0 = toRad(points[0][1])
    const lon1 = toRad(points[1][0]), lat1 = toRad(points[1][1])
    const dLon0 = lon1 - lon0
    let smoothedHeading = Math.atan2(
      Math.sin(dLon0) * Math.cos(lat1),
      Math.cos(lat0) * Math.sin(lat1) - Math.sin(lat0) * Math.cos(lat1) * Math.cos(dLon0)
    )

    // Manual camera update every frame — heading follows direction of travel, smoothed
    const LOOK_AHEAD_S = 4  // sample this many seconds ahead for bearing
    const SMOOTH = 0.08     // per-frame blend (lower = smoother but laggier)
    const offset = new Cesium.HeadingPitchRange(smoothedHeading, Cesium.Math.toRadians(-30), 3000)
    cameraHandlerRef.current = viewer.scene.postUpdate.addEventListener((_scene: unknown, time: CesiumType) => {
      const currentPos = pos.getValue(time, new Cesium.Cartesian3())
      if (!currentPos) return

      const aheadTime = Cesium.JulianDate.addSeconds(time, LOOK_AHEAD_S, new Cesium.JulianDate())
      const aheadPos = pos.getValue(aheadTime, new Cesium.Cartesian3())
      if (aheadPos) {
        const c1 = Cesium.Cartographic.fromCartesian(currentPos)
        const c2 = Cesium.Cartographic.fromCartesian(aheadPos)
        const dLon = c2.longitude - c1.longitude
        const targetHeading = Math.atan2(
          Math.sin(dLon) * Math.cos(c2.latitude),
          Math.cos(c1.latitude) * Math.sin(c2.latitude) - Math.sin(c1.latitude) * Math.cos(c2.latitude) * Math.cos(dLon)
        )
        // Normalize diff to [-π, π] to avoid wrap-around snaps
        let diff = targetHeading - smoothedHeading
        while (diff > Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        smoothedHeading += diff * SMOOTH
      }

      offset.heading = smoothedHeading
      viewer.camera.lookAt(currentPos, offset)

      const elapsedS = Cesium.JulianDate.secondsDifference(time, start)
      const t = Math.min(Math.max(elapsedS / DURATION_S, 0), 1)
      updateChartCursor(Math.round(t * (points.length - 1)))
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
    trackEvent('flyover_stop')
    cameraHandlerRef.current?.()
    cameraHandlerRef.current = null
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY)
    setFlying(false)
    const heights = heightsRef.current
    const positions = points.map(([lon, lat], i) => Cesium.Cartesian3.fromDegrees(lon, lat, heights[i]))
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
    <div className="rounded-xl overflow-hidden border border-border">
      <div className="relative">
        {!ready && (
          <MapLoader className="absolute inset-0 z-10" />
        )}
        <div
          ref={containerRef}
          className="w-full h-72 sm:h-[420px]"
          style={{ position: 'relative', display: 'block' }}
        />
      </div>
      {ready && (
        <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
          <div className="bg-[#eef4fa]">
            <div className="flex items-center gap-1 px-2 py-2">
              <button
                onClick={flying ? stopFlyover : startFlyover}
                className="group flex items-center gap-2.5 pl-1.5 pr-3.5 py-1 rounded-full hover:bg-white/70 transition-colors cursor-pointer"
              >
                <span className="flex items-center justify-center w-9 h-9 rounded-full bg-[#366DA1] text-white shadow-sm group-hover:bg-[#2d5c8e] transition-colors shrink-0">
                  {flying ? (
                    <Square size={13} className="fill-current" />
                  ) : (
                    <Play size={13} className="fill-current ml-0.5" />
                  )}
                </span>
                <span className="text-sm font-semibold text-[#1e3a5f]">
                  {flying ? 'Stop' : 'Flyover 3D'}
                </span>
              </button>

              <div className="w-px h-6 bg-[#c9dbea] mx-0.5 shrink-0" />

              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-full hover:bg-white/70 transition-colors cursor-pointer text-sm font-semibold text-[#1e3a5f]">
                  <ChevronDown size={15} className={cn('transition-transform shrink-0', chartOpen && 'rotate-180')} />
                  {labels.toggle}
                </button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div className="px-4 pb-4 pt-1">
                <span ref={infoLabelRef} className="block text-sm font-medium text-[#1e3a5f] h-5" />
                {chartOpen && (
                  <ElevationChart
                    distances={distances}
                    elevations={elevations}
                    difficulty={difficulty}
                    onScrubStart={handleScrubStart}
                    onScrubMove={updateCursorAt}
                    onScrubEnd={handleScrubEnd}
                    registerCursorUpdater={(fn: (index: number) => void) => { chartCursorUpdaterRef.current = fn }}
                  />
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}
    </div>
  )
}
