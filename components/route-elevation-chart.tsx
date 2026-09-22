'use client'
import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import { DIFFICULTY_HEX } from './difficulty-badge'

const MARGIN_LEFT = 8
const MARGIN_RIGHT = 8

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
  const rafRef = useRef<number | null>(null)
  const draggingRef = useRef(false)

  const totalDistance = distances[distances.length - 1] || 1
  const data = useMemo(
    () => heights.map((h, i) => ({ distance: distances[i], elevation: Math.round(h) })),
    [distances, heights]
  )

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
    if (!container || !cursor) return
    const plotWidth = container.clientWidth - MARGIN_LEFT - MARGIN_RIGHT
    const x = MARGIN_LEFT + (distances[index] / totalDistance) * plotWidth
    cursor.style.display = 'block'
    cursor.style.transform = `translateX(${x}px)`
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
    const plotWidth = rect.width - MARGIN_LEFT - MARGIN_RIGHT
    const x = clientX - rect.left - MARGIN_LEFT
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
        className="absolute top-2 bottom-0 w-px bg-foreground/70 pointer-events-none z-10"
        style={{ display: 'none', left: 0 }}
      />
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <AreaChart data={data} margin={{ top: 8, right: MARGIN_RIGHT, bottom: 0, left: MARGIN_LEFT }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="distance"
            tickFormatter={(v: number) => `${v.toFixed(1)} km`}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey="elevation"
            tickFormatter={(v: number) => `${v} m`}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Area
            dataKey="elevation"
            type="monotone"
            fill={color}
            fillOpacity={0.15}
            stroke={color}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  )
}
