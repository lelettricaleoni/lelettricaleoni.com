'use client'

import type { ReactNode } from 'react'
import { LuMinus, LuPlus } from 'react-icons/lu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { quantityOf, totalBikes, withQuantity } from '@/lib/booking/cart'
import type { BookableModel } from '@/lib/booking/catalog'
import { fill } from '@/lib/booking/format'
import { MAX_BIKES_PER_BOOKING, type BikeSpec, type CartItem } from '@/lib/booking/rules'
import { formatPrice } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { RentDict } from './rent-flow'

type Lang = 'it' | 'en' | 'de'

/**
 * A model: its photo, name, category and the price of the stay for one bike, and a row with a counter for every size (and version) that
 * has a bike free. Two bikes of the same model and size are the same to the customer; the shop gives out the physical one. A model with
 * no bike free for the days stays on the page, switched off, so the person sees what exists and what is taken.
 */
export function ModelCard({
  model, lang, dict, cart, media, onChange,
}: { model: BookableModel; lang: Lang; dict: RentDict; cart: CartItem[]; media: ReactNode; onChange: (next: CartItem[]) => void }) {
  const [, priceTail] = dict.price_each.split('{price}')
  const off = model.totalFree === 0 && !model.tooLong
  return (
    <article className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card', off && 'opacity-70')}>
      <div className={cn('relative h-40 overflow-hidden bg-white', off && 'grayscale')}>{media}</div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1.5">
          <h3 className="font-bold text-foreground">{model.name}</h3>
          <Badge variant="secondary" className="text-xs">{model.categoryName}</Badge>
        </div>
        {model.stayPriceCents !== null && (
          <p className="text-sm text-muted-foreground">
            <strong className="font-semibold text-primary">{formatPrice(model.stayPriceCents, lang)}</strong>
            {fill(priceTail, { days: model.days === 1 ? dict.days_one : fill(dict.days_other, { n: model.days }) })}
          </p>
        )}
        {model.tooLong && <p className="text-sm text-muted-foreground">{fill(dict.too_long, { max: model.maxDays })}</p>}
        {off && <p className="text-sm font-medium text-muted-foreground">{dict.unavailable_dates}</p>}
        {!model.tooLong && !off && (
          <ul className="divide-y">
            {model.variants.flatMap((variant) =>
              variant.versions.map((version) => {
                const spec: BikeSpec = { bikeModelId: model.id, bikeSizeId: variant.sizeId, bikeVersionId: version.versionId }
                const quantity = quantityOf(cart, spec)
                const full = totalBikes(cart) >= MAX_BIKES_PER_BOOKING
                return (
                  <li key={`${variant.sizeId}.${version.versionId}`} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {fill(dict.size_label, { size: variant.sizeName })}
                        {variant.chooseVersion && ` · ${version.versionName}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {version.free === 1 ? dict.free_one : fill(dict.free_other, { n: version.free })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button" variant="outline" size="icon" className="size-9" aria-label={dict.fewer}
                        disabled={quantity === 0} onClick={() => onChange(withQuantity(cart, spec, quantity - 1, version.free))}
                      >
                        <LuMinus />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                      <Button
                        type="button" variant="outline" size="icon" className="size-9" aria-label={dict.more}
                        disabled={quantity >= version.free || full} onClick={() => onChange(withQuantity(cart, spec, quantity + 1, version.free))}
                      >
                        <LuPlus />
                      </Button>
                    </div>
                  </li>
                )
              }),
            )}
          </ul>
        )}
      </div>
    </article>
  )
}
