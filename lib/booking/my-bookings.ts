import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import {
  db, bikeModelTranslations, bikeReservations, bikeSizes, bikeUnits, bikeVersions, bookingRefunds, bookings, type Booking,
} from '@/lib/db'
import { inclusiveEnd, todayInRome, type IsoDate } from '@/lib/dates'
import { isRefundable, refundDeadline } from './refund-deadline'

type Lang = 'it' | 'en' | 'de'

/** What a customer sees of one bike of an online booking. */
export interface MyBike {
  reservationId: string
  status: 'held' | 'confirmed' | 'cancelled' | 'expired'
  /** For its photo. */
  modelId: string
  modelName: string
  sizeName: string
  versionName: string
  amountCents: number
  /** The last moment a full refund is due: 09:00 in Rome, two days before the first day. */
  refundableUntil: Date
  /** Paid, not cancelled, and the refund deadline has not passed. */
  canCancel: boolean
  refund: { amountCents: number; status: 'pending' | 'succeeded' | 'failed' } | null
}

export interface MyBooking {
  id: string
  status: Booking['status']
  startsOn: IsoDate
  /** Exclusive, as stored. */
  endsOn: IsoDate
  /** The last day of the stay, included. */
  lastDay: IsoDate
  createdAt: Date
  totalCents: number
  /** While the booking waits for its payment: the moment the bikes are given up. Otherwise null. */
  holdExpiresAt: Date | null
  /** Waiting for payment and the bikes are still held: "Complete payment" can be offered. */
  canPay: boolean
  bikes: MyBike[]
}

interface Options {
  /** For tests: what day and moment it is. */
  today?: IsoDate
  now?: Date
}

// What a person sees of their bookings: those that are paid, cancelled, refunded, or being paid. An attempt that expired is not a booking.
const SHOWN = ['pending', 'confirmed', 'cancelled', 'failed_refunded'] as const
// A bike row is shown while it is, or was, theirs: a bike held again after a late payment leaves the old expired row aside.
const SHOWN_BIKE = ['held', 'confirmed', 'cancelled'] as const

async function load(customerId: string, lang: Lang, options: Options, onlyBookingId?: string): Promise<MyBooking[]> {
  const now = options.now ?? new Date()
  const rows = await db.select().from(bookings)
    .where(and(
      eq(bookings.customerId, customerId), inArray(bookings.status, [...SHOWN]),
      onlyBookingId ? eq(bookings.id, onlyBookingId) : undefined,
    ))
    .orderBy(desc(bookings.startsOn), desc(bookings.createdAt))
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)

  const lines = await db
    .select({
      id: bikeReservations.id, bookingId: bikeReservations.bookingId, status: bikeReservations.status,
      amountCents: bikeReservations.amountCents, modelId: bikeUnits.bikeModelId,
      sizeName: bikeSizes.name, versionName: bikeVersions.name,
    })
    .from(bikeReservations)
    .innerJoin(bikeUnits, eq(bikeUnits.id, bikeReservations.bikeUnitId))
    .innerJoin(bikeSizes, eq(bikeSizes.id, bikeUnits.bikeSizeId))
    .innerJoin(bikeVersions, eq(bikeVersions.id, bikeUnits.bikeVersionId))
    .where(and(inArray(bikeReservations.bookingId, ids), inArray(bikeReservations.status, [...SHOWN_BIKE])))
    .orderBy(asc(bikeReservations.createdAt), asc(bikeReservations.id))
  const refunds = await db.select().from(bookingRefunds).where(inArray(bookingRefunds.bookingId, ids))
  const modelIds = [...new Set(lines.map((line) => line.modelId))]
  const names = modelIds.length === 0 ? [] : await db
    .select({ modelId: bikeModelTranslations.bikeModelId, locale: bikeModelTranslations.locale, name: bikeModelTranslations.name })
    .from(bikeModelTranslations).where(inArray(bikeModelTranslations.bikeModelId, modelIds))

  return rows.map((booking) => ({
    id: booking.id,
    status: booking.status,
    startsOn: booking.startsOn,
    endsOn: booking.endsOn,
    lastDay: inclusiveEnd(booking.endsOn),
    createdAt: booking.createdAt,
    totalCents: booking.totalCents,
    holdExpiresAt: booking.status === 'pending' ? booking.holdExpiresAt : null,
    canPay: booking.status === 'pending' && booking.holdExpiresAt.getTime() > now.getTime(),
    bikes: lines.filter((line) => line.bookingId === booking.id).map((line): MyBike => {
      const own = names.filter((entry) => entry.modelId === line.modelId)
      const refund = refunds.find((entry) => entry.reservationId === line.id)
      return {
        reservationId: line.id,
        status: line.status as MyBike['status'],
        modelId: line.modelId,
        modelName: (own.find((entry) => entry.locale === lang) ?? own.find((entry) => entry.locale === 'it') ?? own[0])?.name ?? '',
        sizeName: line.sizeName,
        versionName: line.versionName,
        amountCents: line.amountCents ?? 0,
        refundableUntil: refundDeadline(booking.startsOn),
        canCancel: line.status === 'confirmed' && isRefundable(booking.startsOn, now),
        refund: refund ? { amountCents: refund.amountCents, status: refund.status } : null,
      }
    }),
  }))
}

/** The customer's bookings, the ones still to come (or being paid) and the rest, the nearest first. */
export async function listMyBookings(customerId: string, lang: Lang, options: Options = {}): Promise<{ upcoming: MyBooking[]; past: MyBooking[] }> {
  const today = options.today ?? todayInRome()
  const all = await load(customerId, lang, options)
  const isUpcoming = (b: MyBooking) => (b.status === 'confirmed' || b.status === 'pending') && b.lastDay >= today
  return {
    upcoming: all.filter(isUpcoming).sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    past: all.filter((b) => !isUpcoming(b)),
  }
}

/** One booking of the customer, or null: it does not exist, it is not theirs, or it was only an attempt that expired. */
export async function getMyBooking(customerId: string, bookingId: string, lang: Lang, options: Options = {}): Promise<MyBooking | null> {
  return (await load(customerId, lang, options, bookingId))[0] ?? null
}
