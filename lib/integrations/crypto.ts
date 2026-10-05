import 'server-only'
import { CompactEncrypt, compactDecrypt } from 'jose'

/*
 * Secrets of the integrations (a service account key, later an API key) are stored encrypted in the
 * database. Authenticated encryption (AES-256-GCM, as a compact JWE) done by `jose`, nothing hand-made.
 *
 * The key is NOT in the database: it is the INTEGRATIONS_ENCRYPTION_KEY environment variable, so a
 * dump of the database alone reveals nothing. Only the server ever decrypts; never import this from a
 * client component (`server-only` makes that a build error).
 */

const KEY_ENV = 'INTEGRATIONS_ENCRYPTION_KEY'
const KEY_BYTES = 32
/** Written in every token, so a later key rotation can tell which key made which token. */
const KEY_ID = 'v1'

export class EncryptionKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EncryptionKeyError'
  }
}

function readKey(): Uint8Array {
  const value = process.env[KEY_ENV]
  if (!value) throw new EncryptionKeyError(`${KEY_ENV} is not set: integration secrets cannot be saved or read`)
  const key = Buffer.from(value, 'base64')
  if (key.length !== KEY_BYTES) {
    throw new EncryptionKeyError(`${KEY_ENV} must be ${KEY_BYTES} bytes encoded in base64`)
  }
  return new Uint8Array(key)
}

export function isEncryptionConfigured(): boolean {
  try {
    readKey()
    return true
  } catch {
    return false
  }
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = readKey()
  return new CompactEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: KEY_ID })
    .encrypt(key)
}

/** Throws on a token that was changed, made with another key, or is not a token. */
export async function decryptSecret(token: string): Promise<string> {
  const key = readKey()
  const { plaintext } = await compactDecrypt(token, key, { keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'] })
  return new TextDecoder().decode(plaintext)
}
