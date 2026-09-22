'use client'
import { useEffect, useId, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Area, AreaChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { DIFFICULTY_HEX } from './difficulty-badge'

const MARGIN_LEFT = 8
const MARGIN_RIGHT = 8
const AXIS_PADDING = 18

interface PlotBounds {
  left: number
  width: number
  /** Pixel Y del bordo inferiore del grafico (dove elevation = yDomain[0]) */
  yMinPixel: number
  /** Pixel Y del bordo superiore (dove elevation = yDomain[1]) */
  yMaxPixel: number
}

interface RouteElevationChartProps {
  /** km cumulati, riscalati sulla distanza reale del percorso — vedi RouteFlyover */
  distances: number[]
  /** metri, quote GPX originali — le stesse che danno il dislivello mostrato nelle card */
  elevations: number[]
  difficulty?: string
  onScrubStart: () => void
  onScrubMove: (index: number) => void
  /** No-op per design: il cursore resta dov'è al rilascio, vedi lo spec */
  onScrubEnd: () => void
  registerCursorUpdater: (fn: (index: number) => void) => void
}

export function RouteElevationChart({
  distances, elevations, difficulty, onScrubStart, onScrubMove, onScrubEnd, registerCursorUpdater,
}: RouteElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorDotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  // Bordi reali del grafico disegnato da Recharts, misurati dal DOM invece di
  // stimati a mano: provare a replicare a memoria i margini interni di
  // Recharts è quello che causava sia il cursore fuori asse in orizzontale
  // sia il pallino disallineato dalla curva in verticale.
  const plotBoundsRef = useRef<PlotBounds | null>(null)
  // Id univoco per il gradiente/filtro SVG: più grafici sulla stessa pagina
  // (in teoria, non nel caso d'uso di oggi) non devono condividere lo stesso <defs>.
  const gradientId = useId()
  const glowId = useId()

  const totalDistance = distances[distances.length - 1] || 1
  const data = useMemo(
    () => elevations.map((h, i) => ({ distance: distances[i], elevation: Math.round(h) })),
    [distances, elevations]
  )

  const peak = useMemo(() => {
    let peakIndex = 0
    for (let i = 1; i < elevations.length; i++) {
      if (elevations[i] > elevations[peakIndex]) peakIndex = i
    }
    return { index: peakIndex, distance: distances[peakIndex], elevation: Math.round(elevations[peakIndex]) }
  }, [elevations, distances])

  const minElevation = Math.min(...elevations)
  const maxElevation = Math.max(...elevations)
  // Margine sopra il picco per l'etichetta, sotto il minimo per far "respirare" il riempimento
  const yDomain: [number, number] = [
    Math.max(0, Math.floor((minElevation - (maxElevation - minElevation) * 0.15) / 50) * 50),
    Math.ceil((maxElevation + (maxElevation - minElevation) * 0.22) / 50) * 50,
  ]

  const color = DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'
  const chartConfig: ChartConfig = {
    elevation: { label: 'Elevation', color },
  }

  function measurePlotBounds() {
    const container = containerRef.current
    if (!container) return
    const curve = container.querySelector('.recharts-area-curve') as SVGPathElement | null
    const minAnchor = container.querySelector('.y-anchor-min line') as SVGLineElement | null
    const maxAnchor = container.querySelector('.y-anchor-max line') as SVGLineElement | null
    if (!curve || !minAnchor || !maxAnchor) return
    const containerRect = container.getBoundingClientRect()
    const curveRect = curve.getBoundingClientRect()
    if (curveRect.width === 0) return
    plotBoundsRef.current = {
      left: curveRect.left - containerRect.left,
      width: curveRect.width,
      yMinPixel: minAnchor.getBoundingClientRect().top - containerRect.top,
      yMaxPixel: maxAnchor.getBoundingClientRect().top - containerRect.top,
    }
  }

  // Rimisura ad ogni cambio di dati o di dimensione — un ridimensionamento
  // della finestra sposta esattamente dove Recharts disegna la curva.
  useEffect(() => {
    measurePlotBounds()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(measurePlotBounds)
    ro.observe(container)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Sposta solo il cursore CSS sopra il grafico — mai uno stato React. Chiamata
  // sia dal trascinamento (via onScrubMove più sotto) sia, tramite
  // registerCursorUpdater, dal loop del volo automatico dentro RouteFlyover.
  function moveCursorTo(index: number) {
    const cursor = cursorRef.current
    const dot = cursorDotRef.current
    const bounds = plotBoundsRef.current
    if (!cursor || !bounds) return
    const x = bounds.left + (distances[index] / totalDistance) * bounds.width
    cursor.style.display = 'block'
    cursor.style.transform = `translateX(${x}px)`
    if (dot) {
      const t = (elevations[index] - yDomain[0]) / (yDomain[1] - yDomain[0])
      const y = bounds.yMinPixel + t * (bounds.yMaxPixel - bounds.yMinPixel)
      dot.style.display = 'block'
      dot.style.transform = `translate(${x}px, ${y}px)`
    }
  }

  useEffect(() => {
    registerCursorUpdater(moveCursorTo)
    // Si ri-registra solo se cambia il tracciato: moveCursorTo chiude su
    // distances/totalDistance, che cambiano solo quando cambia points nel
    // genitore — non ad ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distances, totalDistance])

  function indexAtClientX(clientX: number): number {
    const container = containerRef.current
    const bounds = plotBoundsRef.current
    if (!container || !bounds) return 0
    const x = clientX - container.getBoundingClientRect().left - bounds.left
    const targetDistance = Math.min(Math.max((x / bounds.width) * totalDistance, 0), totalDistance)

    let closest = 0
    let closestDiff = Infinity
    for (let i = 0; i < distances.length; i++) {
      const diff = Math.abs(distances[i] - targetDistance)
      if (diff < closestDiff) { closestDiff = diff; closest = i }
    }
    return closest
  }

  // Un solo aggiornamento per frame anche se pointermove spara più eventi —
  // stesso motivo per cui il volo automatico non passa da setState.
  function scheduleScrub(clientX: number) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const index = indexAtClientX(clientX)
      moveCursorTo(index)
      onScrubMove(index)
    })
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
    onScrubStart()
    scheduleScrub(e.clientX)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    e.stopPropagation()
    scheduleScrub(e.clientX)
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    e.stopPropagation()
    draggingRef.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
    onScrubEnd()
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative touch-none cursor-ew-resize select-none')}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        ref={cursorRef}
        className="absolute top-2 bottom-5 w-px pointer-events-none z-10"
        style={{ display: 'none', left: 0, backgroundColor: color, opacity: 0.55 }}
      />
      <div
        ref={cursorDotRef}
        className="absolute top-0 left-0 w-2.5 h-2.5 -mt-[5px] -ml-[5px] rounded-full border-2 border-white pointer-events-none z-10 shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
        style={{ display: 'none', backgroundColor: color }}
      />
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <AreaChart data={data} margin={{ top: 8, right: MARGIN_RIGHT, bottom: 5, left: MARGIN_LEFT }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0.03} />
            </linearGradient>
            <filter id={glowId} x="-20%" y="-40%" width="140%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor={color} floodOpacity="0.45" />
            </filter>
          </defs>
          <XAxis
            dataKey="distance"
            type="number"
            domain={[0, totalDistance]}
            ticks={[0, totalDistance]}
            tickFormatter={(v: number) => `${v.toFixed(0)} km`}
            tickLine={false}
            axisLine={false}
            tickMargin={6}
            interval={0}
            padding={{ left: AXIS_PADDING, right: AXIS_PADDING }}
            className="text-[11px] fill-muted-foreground"
          />
          <YAxis dataKey="elevation" domain={yDomain} hide />
          {/* Invisibili: servono solo come riferimento misurabile dal DOM per
              sapere esattamente a che pixel Recharts disegna i due estremi
              del dominio verticale — vedi measurePlotBounds sopra. */}
          <ReferenceLine y={yDomain[0]} stroke="transparent" className="y-anchor-min" />
          <ReferenceLine y={yDomain[1]} stroke="transparent" className="y-anchor-max" />
          <Area
            dataKey="elevation"
            type="monotone"
            fill={`url(#${gradientId})`}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
            isAnimationActive={false}
            style={{ filter: `url(#${glowId})` }}
          />
          <ReferenceDot
            x={peak.distance}
            y={peak.elevation}
            r={3.5}
            fill={color}
            stroke="white"
            strokeWidth={1.5}
            isFront
            label={{
              value: `${peak.elevation} m`,
              position: 'top',
              className: 'fill-current text-[11px] font-semibold',
              style: { fill: '#1e3a5f' },
            }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
