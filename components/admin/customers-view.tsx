import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CustomerEditForm } from '@/components/admin/customer-edit-form'
import { fullName } from '@/lib/customer'
import { inclusiveEnd } from '@/lib/dates'
import { formatEuros } from '@/lib/money'
import type { CustomerDetail, CustomerListItem } from '@/lib/customers'

/** The list: who rented, how many times, what they paid. Plain markup, the page reads the data. */
export function CustomersView({ customers, query }: { customers: CustomerListItem[]; query: string }) {
  const revenueCents = customers.reduce((sum, customer) => sum + customer.revenueCents, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#1e3a5f]">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who rented, with what they rented and what they paid. New customers are added from a new rental.
        </p>
      </div>

      <form className="flex max-w-xl gap-2" action="/manage/customers" method="get" role="search">
        <Input name="q" defaultValue={query} maxLength={100} placeholder="Search by name, phone or email" aria-label="Search customers" />
        <Button type="submit">Search</Button>
        {query && <Button asChild variant="ghost"><Link href="/manage/customers">Clear</Link></Button>}
      </form>

      {customers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{query ? 'Nobody matches that search.' : 'No customers yet.'}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {customers.length} {customers.length === 1 ? 'customer' : 'customers'} · {formatEuros(revenueCents)} in total
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Rentals</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Last rental</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">
                    <Link className="text-[#366DA1] hover:underline" href={`/manage/customers/${customer.id}`}>
                      {fullName(customer.firstName, customer.lastName)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {[customer.phone, customer.email].filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell className="text-right">{customer.rentals}</TableCell>
                  <TableCell className="text-right">{formatEuros(customer.revenueCents)}</TableCell>
                  <TableCell>{customer.lastRentalOn ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}

/** One customer: contacts, the totals, and every rental (cancelled ones listed, not counted). */
export function CustomerView({ detail }: { detail: CustomerDetail }) {
  const { customer, stats, rentals } = detail

  return (
    <div className="space-y-6">
      <Link href="/manage/customers" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={16} /> Customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1e3a5f]">{fullName(customer.firstName, customer.lastName)}</h1>
          <div className="mt-1 space-y-0.5 text-sm">
            {customer.phone && <p><a className="text-[#366DA1] underline" href={`tel:${customer.phone}`}>{customer.phone}</a></p>}
            {customer.email && <p><a className="text-[#366DA1] underline" href={`mailto:${customer.email}`}>{customer.email}</a></p>}
            {!customer.phone && !customer.email && <p className="text-muted-foreground">No contacts saved.</p>}
            {customer.notes && <p className="whitespace-pre-line text-muted-foreground">{customer.notes}</p>}
          </div>
        </div>
        <CustomerEditForm customer={customer} />
      </div>

      <dl className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Rentals" value={String(stats.rentals)} />
        <Stat label="Total paid" value={formatEuros(stats.revenueCents)} />
        <Stat label="Last rental" value={stats.lastRentalOn ?? '—'} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Rentals ({rentals.length}){rentals.some((rental) => rental.status === 'cancelled') && ' · cancelled ones are not counted above'}
        </h2>
        {rentals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rentals yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Days</TableHead>
                <TableHead>Bike</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rentals.map((rental) => (
                <TableRow key={rental.id} className={rental.status === 'cancelled' ? 'text-muted-foreground' : undefined}>
                  <TableCell>{rental.startsOn} to {inclusiveEnd(rental.endsOn)}</TableCell>
                  <TableCell>{rental.bike}</TableCell>
                  <TableCell className={rental.status === 'cancelled' ? 'text-right line-through' : 'text-right'}>
                    {rental.amountCents === null ? '—' : formatEuros(rental.amountCents)}
                  </TableCell>
                  <TableCell>{rental.status === 'cancelled' && <Badge variant="secondary">Cancelled</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  )
}
