import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import { db, integrations } from '@/lib/db'
import {
  getDecryptedSecret, getIntegrationState, listIntegrationStates, recordCheck, removeSecret, saveConfig, saveSecret,
  setEnabled,
} from '@/lib/integrations/store'

/** Every row these tests make has this prefix, so cleanup cannot touch a real integration. */
const PREFIX = `db-test-${crypto.randomUUID().slice(0, 8)}-`
const id = (name: string) => `${PREFIX}${name}`
const ADMIN = crypto.randomUUID()

beforeAll(() => { process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString('base64') })
afterEach(async () => { await db.delete(integrations).where(like(integrations.id, `${PREFIX}%`)) })

describe('the secret', () => {
  it('is stored encrypted, not as the text, and comes back whole on the server', async () => {
    await saveSecret(id('a'), '{"private_key":"very-secret"}', ADMIN)
    const [row] = await db.select().from(integrations).where(eq(integrations.id, id('a')))
    expect(row.secretEncrypted).toBeTruthy()
    expect(row.secretEncrypted).not.toContain('very-secret')
    expect(await getDecryptedSecret(id('a'))).toBe('{"private_key":"very-secret"}')
  })

  it('is never part of what the panel reads: only whether there is one', async () => {
    await saveSecret(id('a'), 'secret-text', ADMIN)
    const state = await getIntegrationState(id('a'))
    expect(state).toMatchObject({ id: id('a'), hasSecret: true })
    expect(JSON.stringify(state)).not.toContain('secret-text')
    expect(JSON.stringify(state)).not.toContain('secretEncrypted')
    const listed = (await listIntegrationStates()).find((s) => s.id === id('a'))
    expect(JSON.stringify(listed)).not.toContain('secret')  // only the flag name `hasSecret`, never a value
    expect(listed).toMatchObject({ hasSecret: true })
  })

  it('is replaced by a second one, and the first is gone', async () => {
    await saveSecret(id('a'), 'first', ADMIN)
    const [before] = await db.select().from(integrations).where(eq(integrations.id, id('a')))
    await saveSecret(id('a'), 'second', ADMIN)
    const [after] = await db.select().from(integrations).where(eq(integrations.id, id('a')))
    expect(await getDecryptedSecret(id('a'))).toBe('second')
    expect(after.secretEncrypted).not.toBe(before.secretEncrypted)
  })

  it('is absent for an integration that has none', async () => {
    expect(await getDecryptedSecret(id('nothing'))).toBeNull()
    await saveConfig(id('b'), { calendarId: 'x' }, ADMIN)
    expect(await getDecryptedSecret(id('b'))).toBeNull()
    expect((await getIntegrationState(id('b')))!.hasSecret).toBe(false)
  })

  it('is removed together with the permission to run: removing it turns the integration off', async () => {
    await saveSecret(id('a'), 'secret', ADMIN)
    await setEnabled(id('a'), true, ADMIN)
    await removeSecret(id('a'), ADMIN)
    expect(await getDecryptedSecret(id('a'))).toBeNull()
    expect(await getIntegrationState(id('a'))).toMatchObject({ enabled: false, hasSecret: false, lastError: null })
  })
})

describe('the settings and the state', () => {
  it('knows nothing about an integration that was never touched', async () => {
    expect(await getIntegrationState(id('none'))).toBeNull()
  })

  it('keeps the settings and merges a new save into them', async () => {
    await saveConfig(id('a'), { calendarId: 'cal-1', includePhone: true }, ADMIN)
    await saveConfig(id('a'), { includePhone: false }, ADMIN)
    expect((await getIntegrationState(id('a')))!.config).toEqual({ calendarId: 'cal-1', includePhone: false })
  })

  it('turns on and off without losing the secret or the settings', async () => {
    await saveSecret(id('a'), 'secret', ADMIN)
    await saveConfig(id('a'), { calendarId: 'cal-1' }, ADMIN)
    await setEnabled(id('a'), true, ADMIN)
    expect((await getIntegrationState(id('a')))!.enabled).toBe(true)
    await setEnabled(id('a'), false, ADMIN)
    expect(await getIntegrationState(id('a'))).toMatchObject({ enabled: false, hasSecret: true, config: { calendarId: 'cal-1' } })
    expect(await getDecryptedSecret(id('a'))).toBe('secret')
  })

  it('writes down who changed it last and when', async () => {
    await saveConfig(id('a'), { x: 1 }, ADMIN)
    expect(await getIntegrationState(id('a'))).toMatchObject({ updatedBy: ADMIN, updatedAt: expect.any(Date) })
  })

  it('records the result of a check: the error, then its disappearance', async () => {
    await saveConfig(id('a'), {}, ADMIN)
    await recordCheck(id('a'), 'The calendar is not shared')
    expect(await getIntegrationState(id('a'))).toMatchObject({ lastError: 'The calendar is not shared', lastCheckedAt: expect.any(Date) })
    await recordCheck(id('a'), null)
    expect(await getIntegrationState(id('a'))).toMatchObject({ lastError: null })
  })
})
