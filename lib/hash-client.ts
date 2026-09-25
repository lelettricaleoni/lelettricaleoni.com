/**
 * SHA-256 of a file, computed in the browser.
 *
 * Photos used to pass through the server on their way to R2, which hashed them
 * and could refuse a duplicate before storing anything. They now go straight to
 * storage (a 120 MB TIFF does not fit through a serverless function's request
 * body), so the browser has to do the hashing to keep that warning. Same digest
 * as lib/hash.ts — and as the worker's, which hashes the very same bytes.
 */

/**
 * Above this the file is not hashed here: `subtle.digest` needs the whole file
 * in memory at once. The worker reports the hash after processing anyway (see
 * lib/actions/media-hash.ts), so a huge file loses only the early warning.
 */
export const BROWSER_HASH_MAX_BYTES = 300 * 1024 * 1024

export async function sha256HexOfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
