import { z } from 'zod'
import { buildRange, inclusiveEnd, type DayRange } from '@/lib/dates'
import { MAX_BIKES_PER_BOOKING, cartItemSchema, type CartItem } from './rules'

/*
 * The state of the booking page — the days, the bikes, the quantities — lives in the ADDRESS, not in the browser's storage (that would
 * need a line in the cookie banner), so Back works and a link can be shared. Nothing about a person is ever in it.
 * It is typed by anybody, so every part is read as an untrusted input and what is not understood is left out, never guessed.
 *
 *   /it/rent?from=2031-11-03&to=2031-11-05&b=<model>.<size>.<version>.<quantity>,<model>.<size>.<version>.<quantity>
 *
 * `from` and `to` are the first and the last day, both included, as people say them; inside, the end is exclusive like in the database.
 */

export interface RentState {
  range: DayRange | null
  cart: CartItem[]
  /** A model the person arrived from (the "Book" button of a bike), to show first. */
  focusModelId: string | null
}

type Params = Record<string, string | string[] | undefined>

const firstOf = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
const idSchema = z.uuid()

function parseItem(raw: string): CartItem | null {
  const parts = raw.split('.')
  if (parts.length !== 4) return null
  const [bikeModelId, bikeSizeId, bikeVersionId, quantity] = parts
  const parsed = cartItemSchema.safeParse({ bikeModelId, bikeSizeId, bikeVersionId, quantity: Number(quantity) })
  return parsed.success ? parsed.data : null
}

const sameBike = (a: CartItem, b: CartItem) =>
  a.bikeModelId === b.bikeModelId && a.bikeSizeId === b.bikeSizeId && a.bikeVersionId === b.bikeVersionId

export function parseRentState(params: Params): RentState {
  const from = firstOf(params.from)
  const to = firstOf(params.to)
  const built = from && to ? buildRange(from, to) : null

  const cart: CartItem[] = []
  let total = 0
  for (const raw of (firstOf(params.b) ?? '').split(',')) {
    const item = parseItem(raw)
    // A bike that would take the cart past the limit is left out whole, so nobody is surprised by a changed quantity.
    if (!item || total + item.quantity > MAX_BIKES_PER_BOOKING) continue
    const same = cart.find((existing) => sameBike(existing, item))
    if (same) same.quantity += item.quantity
    else cart.push({ ...item })
    total += item.quantity
  }

  const model = idSchema.safeParse(firstOf(params.model))
  return {
    range: built?.ok ? { startsOn: built.startsOn, endsOn: built.endsOn } : null,
    cart,
    focusModelId: model.success ? model.data : null,
  }
}

/** The address of a state. Only what is there is written, so an empty state is the plain page. */
export function rentHref(lang: string, state: RentState): string {
  const query: string[] = []
  if (state.range) query.push(`from=${state.range.startsOn}`, `to=${inclusiveEnd(state.range.endsOn)}`)
  if (state.cart.length > 0) {
    query.push(`b=${state.cart.map((i) => `${i.bikeModelId}.${i.bikeSizeId}.${i.bikeVersionId}.${i.quantity}`).join(',')}`)
  }
  if (state.focusModelId) query.push(`model=${state.focusModelId}`)
  return `/${lang}/rent${query.length > 0 ? `?${query.join('&')}` : ''}`
}
