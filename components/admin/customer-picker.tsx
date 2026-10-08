'use client'
import { useEffect, useState, useTransition } from 'react'
import { LuUserPlus } from 'react-icons/lu'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CountrySelect } from '@/components/admin/country-select'
import { Textarea } from '@/components/ui/textarea'
import { createCustomerAction, searchCustomersAction } from '@/lib/actions/customers'
import { DEFAULT_PHONE_COUNTRY, fullName } from '@/lib/customer'
import type { CustomerSummary } from '@/lib/customers'

/** "mario rossi" → first name "mario", last name "rossi": the search text becomes the start of a new customer. */
function splitName(text: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = text.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') }
}

function contacts(customer: CustomerSummary): string {
  return [customer.phone, customer.email].filter(Boolean).join(' · ')
}

/**
 * Who rents: search the customers already known (by name, phone or email) or add a new one. The
 * parent only ever gets a customer that exists in the database.
 */
export function CustomerPicker({
  value, onChange,
}: { value: CustomerSummary | null; onChange: (customer: CustomerSummary | null) => void }) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
        <div className="min-w-0">
          <p className="font-medium">{fullName(value.firstName, value.lastName)}</p>
          {contacts(value) && <p className="truncate text-muted-foreground">{contacts(value)}</p>}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>Change</Button>
      </div>
    )
  }

  if (adding) {
    return (
      <NewCustomer
        initial={splitName(query)}
        onCreated={(customer) => { setAdding(false); setQuery(''); onChange(customer) }}
        onCancel={() => setAdding(false)}
      />
    )
  }

  return <Search query={query} onQuery={setQuery} onPick={onChange} onAdd={() => setAdding(true)} />
}

function Search({
  query, onQuery, onPick, onAdd,
}: {
  query: string
  onQuery: (text: string) => void
  onPick: (customer: CustomerSummary) => void
  onAdd: () => void
}) {
  const text = query.trim()
  // The results carry the text they were found for, so a stale answer never shows under newer text.
  const [found, setFound] = useState<{ text: string; list: CustomerSummary[] } | null>(null)

  useEffect(() => {
    if (!text) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchCustomersAction({ query: text }).then((list) => { if (!cancelled) setFound({ text, list }) })
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [text])

  const list = found && found.text === text ? found.list : null

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query} onChange={(event) => onQuery(event.target.value)} maxLength={100}
          placeholder="Name, phone or email" aria-label="Search customers" autoComplete="off"
        />
        <Button type="button" variant="outline" className="shrink-0" onClick={onAdd}>
          <LuUserPlus size={16} className="mr-1" />New customer
        </Button>
      </div>
      {text && list === null && <p className="text-sm text-muted-foreground">Searching…</p>}
      {list?.length === 0 && <p className="text-sm text-muted-foreground">Nobody with that name, phone or email.</p>}
      {list && list.length > 0 && (
        <ul className="divide-y rounded-md border">
          {list.map((customer) => (
            <li key={customer.id}>
              <button
                type="button" onClick={() => onPick(customer)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{fullName(customer.firstName, customer.lastName)}</span>
                {contacts(customer) && <span className="text-muted-foreground">{contacts(customer)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewCustomer({
  initial, onCreated, onCancel,
}: {
  initial: { firstName: string; lastName: string }
  onCreated: (customer: CustomerSummary) => void
  onCancel: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [phone, setPhone] = useState('')
  // Only a number typed without its prefix depends on it: "+49 151…" is German whatever is picked here.
  const [phoneCountry, setPhoneCountry] = useState<string>(DEFAULT_PHONE_COUNTRY)
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ready = firstName.trim() !== '' && lastName.trim() !== ''

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await createCustomerAction({ firstName, lastName, phone, phoneCountry, email, notes })
      if (result.status === 'invalid') { setError(result.message); return }
      if (result.status === 'exists') {
        // The email belongs to someone already in the list: use that person.
        toast.info(`Already in the list (same email): ${fullName(result.customer.firstName, result.customer.lastName)}`)
      }
      onCreated(result.customer)
    })
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="customer-first-name">First name *</Label>
          <Input id="customer-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="customer-last-name">Last name *</Label>
          <Input id="customer-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="customer-phone">Mobile</Label>
        <div className="flex gap-2">
          <CountrySelect value={phoneCountry} onChange={setPhoneCountry} />
          <Input id="customer-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="347 123 4567" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="customer-email">Email</Label>
        <Input id="customer-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="customer-notes">Notes</Label>
        <Textarea id="customer-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" disabled={isPending || !ready} onClick={save}>Save customer</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Back to search</Button>
      </div>
    </div>
  )
}
