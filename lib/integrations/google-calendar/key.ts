import { z } from 'zod'

/*
 * The JSON key file Google gives for a service account. It is validated here and reduced to the fields the
 * Google client needs; whatever else is in the file is dropped. A message NEVER contains a value from the
 * file: only the name of the field that is wrong.
 */

const MAX_BYTES = 10_000
const emailCheck = z.email()

export interface ServiceAccountKey {
  type: 'service_account'
  project_id: string
  private_key_id?: string
  private_key: string
  client_email: string
}

export type ParsedKey =
  | { ok: true; key: ServiceAccountKey; serviceAccountEmail: string }
  | { ok: false; message: string }

const fail = (message: string): ParsedKey => ({ ok: false, message })

const NOT_A_SERVICE_ACCOUNT =
  'This is not a service account key file. In Google Cloud, create a key for a service account (type JSON).'

export function parseServiceAccountKey(text: string): ParsedKey {
  const trimmed = text.trim()
  if (trimmed === '') return fail('Paste or upload the key file first.')
  if (trimmed.length > MAX_BYTES) return fail('This file is too big to be a key file (the limit is 10 KB).')

  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    return fail('This is not valid JSON. Upload the file you downloaded from Google, without changing it.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(NOT_A_SERVICE_ACCOUNT)

  const file = value as Record<string, unknown>
  if (file.type !== 'service_account') return fail(NOT_A_SERVICE_ACCOUNT)

  for (const field of ['project_id', 'private_key', 'client_email'] as const) {
    if (typeof file[field] !== 'string' || file[field] === '') return fail(`The key file is incomplete: "${field}" is missing.`)
  }
  const clientEmail = file.client_email as string
  const privateKey = file.private_key as string
  if (!emailCheck.safeParse(clientEmail).success) {
    return fail('The key file is incomplete: "client_email" is not a valid e-mail address.')
  }
  if (!privateKey.trim().startsWith('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    return fail('The key file is damaged: "private_key" is not a private key.')
  }

  const key: ServiceAccountKey = {
    type: 'service_account',
    project_id: file.project_id as string,
    ...(typeof file.private_key_id === 'string' ? { private_key_id: file.private_key_id } : {}),
    private_key: privateKey,
    client_email: clientEmail,
  }
  return { ok: true, key, serviceAccountEmail: clientEmail }
}
