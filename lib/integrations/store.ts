import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { db, integrations, type Integration } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/integrations/crypto'

/*
 * What the panel and the actions read and write about an integration. The secret goes in through
 * `saveSecret` (encrypted) and out only through `getDecryptedSecret`, which is for the server code that
 * talks to the outside service. Everything the panel can read has the secret replaced by a flag.
 * Each function is ONE statement: this client cannot open a transaction (lib/db/client-options.ts).
 */

export interface IntegrationState {
  id: string
  enabled: boolean
  config: Record<string, unknown>
  /** Whether a secret is saved. The secret itself is never part of the state. */
  hasSecret: boolean
  lastCheckedAt: Date | null
  lastSyncAt: Date | null
  lastError: string | null
  updatedAt: Date
  updatedBy: string | null
}

function toState(row: Integration): IntegrationState {
  return {
    id: row.id, enabled: row.enabled, config: row.config, hasSecret: row.secretEncrypted !== null,
    lastCheckedAt: row.lastCheckedAt, lastSyncAt: row.lastSyncAt, lastError: row.lastError,
    updatedAt: row.updatedAt, updatedBy: row.updatedBy,
  }
}

export async function listIntegrationStates(): Promise<IntegrationState[]> {
  return (await db.select().from(integrations)).map(toState)
}

export async function getIntegrationState(id: string): Promise<IntegrationState | null> {
  const [row] = await db.select().from(integrations).where(eq(integrations.id, id))
  return row ? toState(row) : null
}

/** For the server code that calls the outside service. Null when there is no secret. */
export async function getDecryptedSecret(id: string): Promise<string | null> {
  const [row] = await db.select({ secretEncrypted: integrations.secretEncrypted }).from(integrations).where(eq(integrations.id, id))
  return row?.secretEncrypted ? decryptSecret(row.secretEncrypted) : null
}

export async function saveSecret(id: string, plaintext: string, by: string): Promise<void> {
  const secretEncrypted = await encryptSecret(plaintext)
  await db.insert(integrations)
    .values({ id, secretEncrypted, updatedBy: by })
    .onConflictDoUpdate({ target: integrations.id, set: { secretEncrypted, updatedAt: new Date(), updatedBy: by } })
}

/** Merges into the settings already saved: a save of one option does not forget the others. */
export async function saveConfig(id: string, config: Record<string, unknown>, by: string): Promise<void> {
  await db.insert(integrations)
    .values({ id, config, updatedBy: by })
    .onConflictDoUpdate({
      target: integrations.id,
      set: { config: sql`${integrations.config} || ${JSON.stringify(config)}::jsonb`, updatedAt: new Date(), updatedBy: by },
    })
}

export async function setEnabled(id: string, enabled: boolean, by: string): Promise<void> {
  await db.insert(integrations)
    .values({ id, enabled, updatedBy: by })
    .onConflictDoUpdate({ target: integrations.id, set: { enabled, updatedAt: new Date(), updatedBy: by } })
}

/** Removing the credentials turns the integration off too: nothing can run without them. */
export async function removeSecret(id: string, by: string): Promise<void> {
  await db.update(integrations)
    .set({ secretEncrypted: null, enabled: false, lastError: null, updatedAt: new Date(), updatedBy: by })
    .where(eq(integrations.id, id))
}

/** The outcome of the last connection test: an error message, or null when it worked. */
export async function recordCheck(id: string, error: string | null): Promise<void> {
  await db.update(integrations).set({ lastCheckedAt: new Date(), lastError: error }).where(eq(integrations.id, id))
}
