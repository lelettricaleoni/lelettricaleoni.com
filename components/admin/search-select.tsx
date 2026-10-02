'use client'
import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchSelectOption {
  value: string
  label: string
  /** Extra words the search also matches (a country code, a nickname). */
  keywords?: string[]
}

/**
 * The shadcn "combobox": a button that opens a list with a search box and a scroll, for choices
 * too many for a plain select. `modal` keeps the mouse wheel working inside a dialog.
 */
export function SearchSelect({
  options, value, onChange, placeholder, searchPlaceholder = 'Search', emptyText = 'Nothing found.',
  label, id, className,
}: {
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder: string
  searchPlaceholder?: string
  emptyText?: string
  /** Accessible name when there is no visible <label> pointing at `id`. */
  label?: string
  id?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label}
          className={cn('justify-between px-3 font-normal', !selected && 'text-muted-foreground', className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value} value={option.label} keywords={option.keywords}
                  onSelect={() => { onChange(option.value); setOpen(false) }}
                >
                  <Check className={cn('size-4', option.value === value ? 'opacity-100' : 'opacity-0')} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
