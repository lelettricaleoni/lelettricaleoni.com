'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CountrySelect } from '@/components/admin/country-select'
import { updateCustomerAction } from '@/lib/actions/customers'
import { DEFAULT_PHONE_COUNTRY, fullName } from '@/lib/customer'
import type { CustomerSummary } from '@/lib/customers'

/** Change the details of a customer: every rental of theirs follows. */
export function CustomerEditForm({ customer }: { customer: CustomerSummary }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Edit details</Button></DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit details</DialogTitle></DialogHeader>
        <Fields key={String(open)} customer={customer} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function Fields({ customer, onSaved }: { customer: CustomerSummary; onSaved: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [firstName, setFirstName] = useState(customer.firstName)
  const [lastName, setLastName] = useState(customer.lastName)
  // Saved in the international format, so the number carries its own country: this one is only for a new number.
  const [phoneCountry, setPhoneCountry] = useState<string>(DEFAULT_PHONE_COUNTRY)
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [error, setError] = useState<React.ReactNode>(null)
  const ready = firstName.trim() !== '' && lastName.trim() !== ''

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateCustomerAction(customer.id, { firstName, lastName, phone, phoneCountry, email, notes })
      if (result.status === 'invalid') { setError(result.message); return }
      if (result.status === 'not_found') { toast.error('This customer no longer exists.'); onSaved(); return }
      if (result.status === 'conflict') {
        setError(
          <>
            That {result.matchedOn} already belongs to{' '}
            <Link className="underline" href={`/manage/customers/${result.other.id}`}>
              {fullName(result.other.firstName, result.other.lastName)}
            </Link>.
          </>,
        )
        return
      }
      toast.success('Details saved.')
      onSaved()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="edit-first-name">First name *</Label>
          <Input id="edit-first-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={80} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="edit-last-name">Last name *</Label>
          <Input id="edit-last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={80} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-phone">Mobile</Label>
        <div className="flex gap-2">
          <CountrySelect value={phoneCountry} onChange={setPhoneCountry} />
          <Input id="edit-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-email">Email</Label>
        <Input id="edit-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="edit-notes">Notes</Label>
        <Textarea id="edit-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" disabled={isPending || !ready} onClick={save}>Save</Button>
    </div>
  )
}
