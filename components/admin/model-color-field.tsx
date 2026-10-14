'use client'
import { LuCheck } from 'react-icons/lu'
import { MODEL_COLORS } from '@/lib/bike-colors'
import { cn } from '@/lib/utils'

/**
 * The colour of a bike model: a row of colours to start from, and a field to pick any other one. The value goes with the form as `color`.
 * It is organisational: it tells the models apart in the shop's calendar.
 */
export function ModelColorField({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const inList = MODEL_COLORS.some((color) => color.hex === value)
  return (
    <div className="space-y-2">
      <input type="hidden" name="color" value={value} />
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Colour">
        {MODEL_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            title={color.name}
            aria-label={color.name}
            aria-pressed={value === color.hex}
            onClick={() => onChange(color.hex)}
            style={{ backgroundColor: color.hex }}
            className={cn(
              'flex size-8 cursor-pointer items-center justify-center rounded-md border text-white outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/50',
              value === color.hex && 'ring-2 ring-offset-2 ring-[#1e3a5f]',
            )}
          >
            {value === color.hex && <LuCheck className="size-4" />}
          </button>
        ))}
        <label
          className={cn(
            'flex h-8 cursor-pointer items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground',
            !inList && 'ring-2 ring-offset-2 ring-[#1e3a5f]',
          )}
        >
          <input
            type="color"
            value={value}
            onChange={(event) => onChange(event.target.value.toLowerCase())}
            aria-label="Pick another colour"
            className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          Other
        </label>
      </div>
    </div>
  )
}
