import { eq, sql } from 'drizzle-orm'
import { db, customers } from '@/lib/db'
import { normalisePhone } from './phone'
import { parseLanguage } from './language'

/**
 * Ties a signed-in account to a customer of the shop, or makes one.
 *
 * `customers` is the directory of the people who rent (lib/customers.ts); an account is somebody who
 * can sign in. Rentals the shop registered at the counter belong to a customer with no account, so the
 * first time a person signs in their account is tied to the customer with the SAME EMAIL, and that is
 * how the history they already have comes with them.
 *
 * **Only when the email is confirmed.** Anyone can type another person's address into a sign-up
 * form; tying an unconfirmed account to the customer under that address would hand over that
 * person's history. An unconfirmed account is neither tied nor made into a customer.
 *
 * One statement, because a transaction cannot be used here (lib/route-bike-categories.ts says why):
 *   - the customer already tied to this account wins, and nothing is written;
 *   - otherwise the customer with the same email (any case) and no account is tied to it, keeping
 *     what the shop knows (phone, notes, the names it wrote);
 *   - otherwise a customer is made from the names of the sign-up;
 *   - an email already belonging to a customer tied to ANOTHER account is left alone ('taken').
 * The unique indexes decide a race: two requests for the same account at once end with one customer.
 *
 * The phone is an offer, never a condition: it is written only where the customer has none, and only if no
 * other customer has it (the number is unique). The shop wrote what it has, so an account never overwrites it,
 * and a number that cannot be used is left out without failing the link.
 */
export interface AccountIdentity {
  userId: string
  email: string | null | undefined
  /** `email_confirmed_at` is set: the person proved they can read that mailbox. */
  emailConfirmed: boolean
  firstName?: string
  lastName?: string
  /** What the person typed or Google knows; any format, it is read here and dropped if it is not a valid number. */
  phone?: string | null
  /** The language the person was visiting in; the shop's customer takes it, and the default stays when it is unknown. */
  language?: string | null
}

export type LinkResult =
  | { status: 'created'; customerId: string }
  | { status: 'linked'; customerId: string }
  | { status: 'existing'; customerId: string }
  | { status: 'taken' }
  | { status: 'unverified' }
  | { status: 'no-email' }

export async function linkCustomerToAccount(identity: AccountIdentity): Promise<LinkResult> {
  const result = await link(identity)
  // A phone that lost a race with another customer's makes the insert give way as a whole: try once more without it.
  return result.status === 'taken' && identity.phone ? link({ ...identity, phone: null }) : result
}

async function link(identity: AccountIdentity): Promise<LinkResult> {
  const address = identity.email?.trim().toLowerCase()
  if (!address) return { status: 'no-email' }
  if (!identity.emailConfirmed) return { status: 'unverified' }

  const firstName = identity.firstName?.trim() || address.split('@')[0]
  const lastName = identity.lastName?.trim() ?? ''
  const phone = normalisePhone(identity.phone)
  const language = parseLanguage(identity.language)

  const [row] = await db.execute<{ existing_id: string | null; linked_id: string | null; created_id: string | null }>(sql`
    WITH existing AS (
      SELECT id FROM customers WHERE user_id = ${identity.userId}::uuid
    ),
    linked AS (
      UPDATE customers
      SET user_id = ${identity.userId}::uuid,
          phone = CASE
            WHEN phone IS NULL AND ${phone}::text IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM customers other WHERE other.phone = ${phone}::text)
            THEN ${phone}::text ELSE phone END,
          language = COALESCE(${language}::text, language),
          updated_at = now()
      WHERE user_id IS NULL
        AND lower(email) = ${address}
        AND NOT EXISTS (SELECT 1 FROM existing)
      RETURNING id
    ),
    created AS (
      INSERT INTO customers (user_id, first_name, last_name, email, phone, language)
      SELECT ${identity.userId}::uuid, ${firstName}, ${lastName}, ${address},
             (SELECT ${phone}::text WHERE NOT EXISTS (SELECT 1 FROM customers other WHERE other.phone = ${phone}::text)),
             COALESCE(${language}::text, 'it')
      WHERE NOT EXISTS (SELECT 1 FROM existing)
        AND NOT EXISTS (SELECT 1 FROM linked)
        AND NOT EXISTS (SELECT 1 FROM customers WHERE lower(email) = ${address})
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT
      (SELECT id FROM existing) AS existing_id,
      (SELECT id FROM linked)   AS linked_id,
      (SELECT id FROM created)  AS created_id
  `)

  if (row?.existing_id) return { status: 'existing', customerId: row.existing_id }
  if (row?.linked_id) return { status: 'linked', customerId: row.linked_id }
  if (row?.created_id) return { status: 'created', customerId: row.created_id }

  // Nothing was written. Either a parallel request for this same account got there first (so it has
  // a customer now), or the email belongs to a customer tied to somebody else.
  const [mine] = await db.select({ id: customers.id }).from(customers).where(eq(customers.userId, identity.userId))
  return mine ? { status: 'existing', customerId: mine.id } : { status: 'taken' }
}

/**
 * Puts the confirmed email of the account on its customer, when it changed.
 *
 * An account changes its email in two steps, and only the second one (the click in the new mailbox) changes
 * `user.email`, so what arrives here is always an address the person proved. The customer follows it, unless
 * another customer already has that address: the email is unique, and the older record is not ours to take.
 * Nothing is written then, and the account keeps the address it has.
 */
export async function syncCustomerEmail(userId: string, email: string | null | undefined): Promise<boolean> {
  const address = email?.trim().toLowerCase()
  if (!address) return false
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE customers
    SET email = ${address}, updated_at = now()
    WHERE user_id = ${userId}::uuid
      AND email IS DISTINCT FROM ${address}
      AND NOT EXISTS (SELECT 1 FROM customers other WHERE lower(other.email) = ${address} AND other.user_id IS DISTINCT FROM ${userId}::uuid)
    RETURNING id
  `)
  return rows.length > 0
}
