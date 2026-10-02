import { dayToDate, daysBetween, inclusiveEnd, monthDays, type DayRange, type IsoMonth } from '@/lib/dates'
import type { GridReservation, ReservationKind } from '@/lib/reservations'

export interface GridBlock {
  reservationId: string
  kind: ReservationKind
  label: string | null
  /** 1-based column of the first visible day (the label column is not counted). */
  startColumn: number
  /** Number of visible days. */
  span: number
  clippedStart: boolean
  clippedEnd: boolean
}

/**
 * Where each reservation sits in a month: clipped to the month, so one that starts before it or
 * ends after it still shows, and one that only touches the edge (ends the day the month starts,
 * starts the day it ends) does not.
 */
export function layoutBlocks(month: IsoMonth, reservations: GridReservation[]): GridBlock[] {
  const days = monthDays(month)
  const first = days[0]
  const blocks: GridBlock[] = []

  for (const reservation of reservations) {
    const startOffset = daysBetween(first, reservation.startsOn)
    const endOffset = daysBetween(first, reservation.endsOn)
    const startIndex = Math.max(0, startOffset)
    const endIndex = Math.min(days.length, endOffset)
    const span = endIndex - startIndex
    if (span <= 0) continue

    blocks.push({
      reservationId: reservation.id,
      kind: reservation.kind,
      label: reservation.label,
      startColumn: startIndex + 1,
      span,
      clippedStart: startOffset < 0,
      clippedEnd: endOffset > days.length,
    })
  }
  return blocks
}

/**
 * The days of a bike that are taken, in the shape the calendar widget wants for `disabled`
 * ({ from, to }, both included). Dates only here, at the edge with the widget.
 */
export function occupiedDayRanges(ranges: DayRange[]): { from: Date; to: Date }[] {
  return ranges.map((range) => ({ from: dayToDate(range.startsOn), to: dayToDate(inclusiveEnd(range.endsOn)) }))
}
