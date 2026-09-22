'use client'
import { useEffect, useId, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Area, AreaChart, ReferenceDot, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { DIFFICULTY_HEX } from './difficulty-badge'

const MARGIN_LEFT = 8
const MARGIN_RIGHT = 8
// Spazio in più riservato dentro l'asse X (XAxis padding) perché le etichette
// "0 km"/"N km" ai due estremi non vengano tagliate a metà — il calcolo
// manuale del cursore deve usare lo stesso inset totale, altrimenti il
// puntino si sfasa dalla curva disegnata da Recharts.
const AXIS_PADDING = 18
const INSET_LEFT = MARGIN_LEFT + AXIS_PADDING
const INSET_RIGHT = MARGIN_RIGHT + AXIS_PADDING

interface RouteElevationChartProps {
  /** km cumulati, stessa lunghezza di heights — vedi lib/geo.ts */
  distances: number[]
  /** metri, quote ancorate al terreno — stesse disegnate sul tracciato 3D */
  heights: number[]
  difficulty?: string
  onScrubStart: () => void
  onScrubMove: (index: number) => void
  /** No-op per design: il cursore resta dov'è al rilascio, vedi lo spec */
  onScrubEnd: () => void
  registerCursorUpdater: (fn: (index: number) => void) => void
}

export function RouteElevationChart({
  distances, heights, difficulty, onScrubStart, onScrubMove, onScrubEnd, registerCursorUpdater,
}: RouteElevationChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const cursorDotRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  // Id univoco per il gradiente/filtro SVG: più grafici sulla stessa pagina
  // (in teoria, non nel caso d'uso di oggi) non devono condividere lo stesso <defs>.
  const gradientId = useId()
  const glowId = useId()

  const totalDistance = distances[distances.length - 1] || 1
  const data = useMemo(
    () => heights.map((h, i) => ({ distance: distances[i], elevation: Math.round(h) })),
    [distances, heights]
  )

  const peak = useMemo(() => {
    let peakIndex = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i] > heights[peakIndex]) peakIndex = i
    }
    return { index: peakIndex, distance: distances[peakIndex], elevation: Math.round(heights[peakIndex]) }
  }, [heights, distances])

  const minElevation = Math.min(...heights)
  const maxElevation = Math.max(...heights)
  // Margine sopra il picco per l'etichetta, sotto il minimo per far "respirare" il riempimento
  const yDomain: [number, number] = [
    Math.max(0, Math.floor((minElevation - (maxElevation - minElevation) * 0.15) / 50) * 50),
    Math.ceil((maxElevation + (maxElevation - minElevation) * 0.22) / 50) * 50,
  ]

  const color = DIFFICULTY_HEX[difficulty ?? ''] ?? '#795F91'
  const chartConfig: ChartConfig = {
    elevation: { label: 'Elevation', color },
  }

  // Sposta solo il cursore CSS sopra il grafico — mai uno stato React. Chiamata
  // sia dal trascinamento (via onScrubMove più sotto) sia, tramite
  // registerCursorUpdater, dal loop del volo automatico dentro RouteFlyover.
  function moveCursorTo(index: number) {
    const container = containerRef.current
    const cursor = cursorRef.current
    const dot = cursorDotRef.current
    if (!container || !cursor) return
    const plotWidth = container.clientWidth - INSET_LEFT - INSET_RIGHT
    const x = INSET_LEFT + (distances[index] / totalDistance) * plotWidth
    cursor.style.display = 'block'
    cursor.style.transform = `translateX(${x}px)`
    if (dot) {
      const plotHeight = container.clientHeight - 8
      const t = (heights[index] - yDomain[0]) / (yDomain[1] - yDomain[0])
      const y = 8 + (1 - t) * plotHeight
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
    if (!container) return 0
    const rect = container.getBoundingClientRect()
    const plotWidth = rect.width - INSET_LEFT - INSET_RIGHT
    const x = clientX - rect.left - INSET_LEFT
    const targetDistance = Math.min(Math.max((x / plotWidth) * totalDistance, 0), totalDistance)

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
      className={cn('relative touch-none cursor-crosshair select-none')}
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
