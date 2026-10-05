import { describe, expect, it } from 'vitest'
import { parseServiceAccountKey } from './key'

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC\n-----END PRIVATE KEY-----\n'
const valid = () => ({
  type: 'service_account', project_id: 'my-project', private_key_id: 'abc123',
  private_key: PEM, client_email: 'calendar-sync@my-project.iam.gserviceaccount.com', client_id: '1234567890',
  auth_uri: 'https://accounts.google.com/o/oauth2/auth',
})
const parse = (value: unknown) => parseServiceAccountKey(typeof value === 'string' ? value : JSON.stringify(value))

describe('parseServiceAccountKey', () => {
  it('accepts the file Google gives, and keeps only what is needed', () => {
    const result = parse(valid())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.key).toEqual({
        type: 'service_account', project_id: 'my-project', private_key_id: 'abc123',
        private_key: PEM, client_email: 'calendar-sync@my-project.iam.gserviceaccount.com',
      })
      expect(result.serviceAccountEmail).toBe('calendar-sync@my-project.iam.gserviceaccount.com')
    }
  })

  it('tolerates spaces around the pasted text', () => {
    expect(parse(`\n  ${JSON.stringify(valid())}  \n`).ok).toBe(true)
  })

  it('says it is not JSON, and for an empty paste', () => {
    expect(parse('not json at all')).toEqual({ ok: false, message: 'This is not valid JSON. Upload the file you downloaded from Google, without changing it.' })
    expect(parse('   ')).toEqual({ ok: false, message: 'Paste or upload the key file first.' })
  })

  it('says when it is an OAuth client file or another kind of key, not a service account key', () => {
    const oauth = parse({ installed: { client_id: 'x', client_secret: 'y' } })
    expect(oauth).toEqual({ ok: false, message: 'This is not a service account key file. In Google Cloud, create a key for a service account (type JSON).' })
    expect(parse({ ...valid(), type: 'authorized_user' }).ok).toBe(false)
  })

  it('says which field is missing, without showing any value', () => {
    const { private_key: _removed, ...withoutKey } = valid()
    const result = parse(withoutKey)
    expect(result).toEqual({ ok: false, message: 'The key file is incomplete: "private_key" is missing.' })
    expect(parse({ ...valid(), client_email: 'not-an-email' })).toEqual({ ok: false, message: 'The key file is incomplete: "client_email" is not a valid e-mail address.' })
    expect(parse({ ...valid(), project_id: '' }).ok).toBe(false)
  })

  it('refuses a private key that is not a PEM key', () => {
    const result = parse({ ...valid(), private_key: 'definitely-not-a-key' })
    expect(result).toEqual({ ok: false, message: 'The key file is damaged: "private_key" is not a private key.' })
  })

  it('never puts the secret in a message', () => {
    for (const bad of [{ ...valid(), private_key: 'SECRET-LEAK-CHECK' }, { ...valid(), client_email: 'SECRET-LEAK-CHECK' }]) {
      const result = parse(bad)
      expect(JSON.stringify(result)).not.toContain('SECRET-LEAK-CHECK')
    }
  })

  it('refuses a file that is far too big to be a key, before reading it', () => {
    const result = parse(JSON.stringify({ ...valid(), padding: 'x'.repeat(20_000) }))
    expect(result).toEqual({ ok: false, message: 'This file is too big to be a key file (the limit is 10 KB).' })
  })

  it('refuses JSON that is not an object', () => {
    expect(parse('[1,2,3]').ok).toBe(false)
    expect(parse('"a string"').ok).toBe(false)
    expect(parse('null').ok).toBe(false)
  })
})
