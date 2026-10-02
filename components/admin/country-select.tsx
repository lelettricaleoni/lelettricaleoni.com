'use client'
import { useMemo } from 'react'
import { SearchSelect } from '@/components/admin/search-select'
import { phoneCountryOptions } from '@/lib/phone-countries'

/** A country for a phone number, searchable by name ("germ") or by calling code ("49"). */
export function CountrySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const options = useMemo(
    () => phoneCountryOptions().map((option) => ({ value: option.code, label: option.label, keywords: [option.code] })),
    [],
  )
  return (
    <SearchSelect
      options={options} value={value} onChange={onChange} placeholder="Country"
      searchPlaceholder="Search country or code" emptyText="No country found."
      label="Country of the phone number" className="w-40 shrink-0"
    />
  )
}
