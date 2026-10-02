import { and, desc, eq, ilike, or } from 'drizzle-orm'
import { db, customers, type Customer } from '@/lib/db'
import type { CustomerInput } from '@/lib/customer'

/*
 * The directory of the people who rent. The same phone or the same email is the same person
 * (unique indexes in the database), a name alone is not: two Mario Rossi with different contacts
 * are two customers.
 */

export interface CustomerSummary {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  notes: string | null
}

export function summarize(row: Customer): CustomerSummary {
  return {
    id: row.id, firstName: row.firstName, lastName: row.lastName,
    email: row.email, phone: row.phone, notes: row.notes,
  }
}

export type CreateCustomerResult =
  | { status: 'created'; customer: CustomerSummary }
  | { status: 'exists'; customer: CustomerSummary; matchedOn: 'email' | 'phone' }

/** One statement: a unique index decides, so two people saving the same phone at once cannot both win. */
export async function createCustomer(input: CustomerInput): Promise<CreateCustomerResult> {
  const inserted = await db.insert(customers)
    .values({
      firstName: input.firstName, lastName: input.lastName,
      email: input.email ?? null, phone: input.phone ?? null, notes: input.notes ?? null,
    })
    .onConflictDoNothing()
    .returning()
  if (inserted.length > 0) return { status: 'created', customer: summarize(inserted[0]) }

  // Only an email or a phone can collide; without either there is nothing to look for (and a
  // `where` with nothing in it would return an arbitrary customer).
  if (!input.email && !input.phone) throw new Error('Customer not created for an unknown reason')
  const [existing] = await db.select().from(customers).where(or(
    input.email ? eq(customers.email, input.email) : undefined,
    input.phone ? eq(customers.phone, input.phone) : undefined,
  ))
  // Not found means the conflict was on something this call does not control; say so loudly.
  if (!existing) throw new Error('Customer not created and no existing customer found')
  return {
    status: 'exists', customer: summarize(existing),
    matchedOn: input.email && existing.email === input.email ? 'email' : 'phone',
  }
}

const SEARCH_LIMIT = 8

/** `%` and `_` in what a person types are characters, not wildcards. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&')
}

/**
 * Every word must appear in the first name, the last name, the email or the phone, so "mario ros"
 * and "ros mario" both find Mario Rossi and "347 987" finds a number typed with a space.
 */
export async function searchCustomers(query: string): Promise<CustomerSummary[]> {
  const words = query.split(/\s+/).filter(Boolean)
  if (words.length === 0) return []

  const rows = await db.select().from(customers)
    .where(and(...words.map((word) => {
      const pattern = `%${escapeLike(word)}%`
      return or(
        ilike(customers.firstName, pattern), ilike(customers.lastName, pattern),
        ilike(customers.email, pattern), ilike(customers.phone, pattern),
      )
    })))
    .orderBy(customers.lastName, customers.firstName, desc(customers.createdAt))
    .limit(SEARCH_LIMIT)
  return rows.map(summarize)
}
