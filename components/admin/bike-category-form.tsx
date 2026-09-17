'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BikeCategory } from '@/lib/db'
import type { BikeCategoryInput } from '@/lib/actions/bike-options'

export function BikeCategoryForm({
  category,
  onSubmit,
  onCancel,
}: {
  category?: BikeCategory
  onSubmit: (input: BikeCategoryInput) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [maxRentalDays, setMaxRentalDays] = useState(category?.maxRentalDays ?? 7)
  const [pricingMode, setPricingMode] = useState<'table' | 'linear'>(category?.pricingMode ?? 'table')
  const [day1Price, setDay1Price] = useState(category?.day1Price ?? '')
  const [day2Price, setDay2Price] = useState(category?.day2Price ?? '')
  const [day3Price, setDay3Price] = useState(category?.day3Price ?? '')
  const [day4Price, setDay4Price] = useState(category?.day4Price ?? '')
  const [day5Price, setDay5Price] = useState(category?.day5Price ?? '')
  const [day6Price, setDay6Price] = useState(category?.day6Price ?? '')
  const [day7Price, setDay7Price] = useState(category?.day7Price ?? '')
  const [perDayAfterPrice, setPerDayAfterPrice] = useState(category?.perDayAfterPrice ?? '')
  const [afternoonPrice, setAfternoonPrice] = useState(category?.afternoonPrice ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({
      name,
      displayOrder: category?.displayOrder ?? 0,
      maxRentalDays,
      pricingMode,
      day1Price,
      day2Price: day2Price || null,
      day3Price: day3Price || null,
      day4Price: day4Price || null,
      day5Price: day5Price || null,
      day6Price: day6Price || null,
      day7Price: day7Price || null,
      perDayAfterPrice: perDayAfterPrice || null,
      afternoonPrice: afternoonPrice || null,
    })
  }

  const tableDayFields = [
    { id: 'cat-day2', label: 'Day 2', value: day2Price, set: setDay2Price },
    { id: 'cat-day3', label: 'Day 3', value: day3Price, set: setDay3Price },
    { id: 'cat-day4', label: 'Day 4', value: day4Price, set: setDay4Price },
    { id: 'cat-day5', label: 'Day 5', value: day5Price, set: setDay5Price },
    { id: 'cat-day6', label: 'Day 6', value: day6Price, set: setDay6Price },
    { id: 'cat-day7', label: 'Day 7', value: day7Price, set: setDay7Price },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1">
        <Label htmlFor="cat-name">Name *</Label>
        <Input id="cat-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-max-days">Max rental days *</Label>
        <Input
          id="cat-max-days" type="number" min={1} max={7} required
          value={maxRentalDays}
          onChange={(e) => setMaxRentalDays(Number(e.target.value))}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-pricing-mode">Pricing mode *</Label>
        <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as 'table' | 'linear')}>
          <SelectTrigger id="cat-pricing-mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="table">Explicit price per day (1-7)</SelectItem>
            <SelectItem value="linear">Day 1 + flat rate for following days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="cat-day1">Day 1 price *</Label>
        <Input id="cat-day1" type="number" step="0.01" required value={day1Price} onChange={(e) => setDay1Price(e.target.value)} />
      </div>

      {pricingMode === 'table' ? (
        <div className="grid grid-cols-2 gap-3">
          {tableDayFields.map(({ id, label, value, set }) => (
            <div key={id} className="space-y-1">
              <Label htmlFor={id}>{label}</Label>
              <Input id={id} type="number" step="0.01" value={value ?? ''} onChange={(e) => set(e.target.value)} placeholder="not offered" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="cat-per-day">Flat rate for each day after day 1 *</Label>
          <Input
            id="cat-per-day" type="number" step="0.01" required
            value={perDayAfterPrice ?? ''}
            onChange={(e) => setPerDayAfterPrice(e.target.value)}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="cat-afternoon">Afternoon / half-day price</Label>
        <Input id="cat-afternoon" type="number" step="0.01" value={afternoonPrice ?? ''} onChange={(e) => setAfternoonPrice(e.target.value)} placeholder="optional" />
      </div>

      <div className="flex gap-3">
        <Button type="submit">{category ? 'Update category' : 'Create category'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
