import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { EncryptionKeyError, decryptSecret, encryptSecret, isEncryptionConfigured } from './crypto'

const newKey = () => randomBytes(32).toString('base64')

describe('integration secrets encryption', () => {
  const original = process.env.INTEGRATIONS_ENCRYPTION_KEY
  beforeEach(() => { process.env.INTEGRATIONS_ENCRYPTION_KEY = newKey() })
  afterEach(() => {
    if (original === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    else process.env.INTEGRATIONS_ENCRYPTION_KEY = original
  })

  it('gives back exactly what was encrypted, including multi-line text and accents', async () => {
    const text = '{"private_key":"-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n","note":"è ü 🚲"}'
    expect(await decryptSecret(await encryptSecret(text))).toBe(text)
  })

  it('produces a different token every time for the same text', async () => {
    expect(await encryptSecret('same')).not.toBe(await encryptSecret('same'))
  })

  it('does not leave the text readable in the token', async () => {
    const token = await encryptSecret('super-secret-value-123')
    expect(token).not.toContain('super-secret-value-123')
    expect(Buffer.from(token, 'base64url').toString('utf8')).not.toContain('super-secret')
  })

  it('refuses a token that was changed', async () => {
    const token = await encryptSecret('hello')
    const parts = token.split('.')
    const flipped = parts[3].startsWith('A') ? 'B' + parts[3].slice(1) : 'A' + parts[3].slice(1)
    await expect(decryptSecret([...parts.slice(0, 3), flipped, parts[4]].join('.'))).rejects.toThrow()
  })

  it('refuses a token made with another key', async () => {
    const token = await encryptSecret('hello')
    process.env.INTEGRATIONS_ENCRYPTION_KEY = newKey()
    await expect(decryptSecret(token)).rejects.toThrow()
  })

  it('refuses text that is not a token at all', async () => {
    await expect(decryptSecret('not a token')).rejects.toThrow()
    await expect(decryptSecret('')).rejects.toThrow()
  })

  it('says plainly that the key is missing, and never encrypts without one', async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY
    expect(isEncryptionConfigured()).toBe(false)
    await expect(encryptSecret('x')).rejects.toBeInstanceOf(EncryptionKeyError)
    await expect(encryptSecret('x')).rejects.toThrow(/INTEGRATIONS_ENCRYPTION_KEY/)
  })

  it('rejects a key that is not 32 bytes', async () => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(16).toString('base64')
    expect(isEncryptionConfigured()).toBe(false)
    await expect(encryptSecret('x')).rejects.toBeInstanceOf(EncryptionKeyError)
  })

  it('knows when it is configured', () => {
    expect(isEncryptionConfigured()).toBe(true)
  })
})
