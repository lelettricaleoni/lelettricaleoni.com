import type { BookableModel } from './catalog'
import { MAX_BIKES_PER_BOOKING, type BikeSpec, type CartItem } from './rules'

/*
 * The cart of the booking page, as plain functions over a list of `{ model, size, version, quantity }`: what the page shows and what
 * the address keeps. Nothing here decides anything that matters: the server prices and checks the cart again when the person pays
 * (`beginCheckout`), so these only keep what is on the screen sensible.
 */

const sameBike = (a: BikeSpec, b: BikeSpec) =>
  a.bikeModelId === b.bikeModelId && a.bikeSizeId === b.bikeSizeId && a.bikeVersionId === b.bikeVersionId

export const totalBikes = (cart: CartItem[]) => cart.reduce((sum, item) => sum + item.quantity, 0)

export const quantityOf = (cart: CartItem[], spec: BikeSpec) => cart.find((item) => sameBike(item, spec))?.quantity ?? 0

/**
 * The cart with `quantity` bikes of this kind: at least none, at most the `free` ones, and never more than ten bikes in all.
 * A kind that ends at none leaves the cart.
 */
export function withQuantity(cart: CartItem[], spec: BikeSpec, quantity: number, free: number): CartItem[] {
  const others = cart.filter((item) => !sameBike(item, spec))
  const room = MAX_BIKES_PER_BOOKING - totalBikes(others)
  const wanted = Math.max(0, Math.min(Math.floor(quantity), free, room))
  if (wanted === 0) return others
  const index = cart.findIndex((item) => sameBike(item, spec))
  const next = { bikeModelId: spec.bikeModelId, bikeSizeId: spec.bikeSizeId, bikeVersionId: spec.bikeVersionId, quantity: wanted }
  if (index === -1) return [...cart, next]
  return cart.map((item, i) => (i === index ? next : item))
}

/** A cart read from an address, made to fit what is bookable now: what is not on the list goes, the rest is clamped to what is free. */
export function sanitizeCart(cart: CartItem[], models: BookableModel[]): CartItem[] {
  let result: CartItem[] = []
  for (const item of cart) {
    const model = models.find((m) => m.id === item.bikeModelId)
    if (!model || model.tooLong) continue
    const version = model.variants.find((v) => v.sizeId === item.bikeSizeId)?.versions.find((v) => v.versionId === item.bikeVersionId)
    if (!version) continue
    result = withQuantity(result, item, item.quantity, version.free)
  }
  return result
}

export interface CartLine extends CartItem {
  modelName: string
  sizeName: string
  /** Only when the person had to choose a version; otherwise there is nothing to say about it. */
  versionName: string | null
  unitCents: number
  lineCents: number
}

export function cartLines(cart: CartItem[], models: BookableModel[]): CartLine[] {
  return cart.flatMap((item) => {
    const model = models.find((m) => m.id === item.bikeModelId)
    const variant = model?.variants.find((v) => v.sizeId === item.bikeSizeId)
    const version = variant?.versions.find((v) => v.versionId === item.bikeVersionId)
    if (!model || !variant || !version || model.stayPriceCents === null) return []
    return [{
      ...item,
      modelName: model.name,
      sizeName: variant.sizeName,
      versionName: variant.chooseVersion ? version.versionName : null,
      unitCents: model.stayPriceCents,
      lineCents: model.stayPriceCents * item.quantity,
    }]
  })
}

export const cartTotalCents = (lines: CartLine[]) => lines.reduce((sum, line) => sum + line.lineCents, 0)
