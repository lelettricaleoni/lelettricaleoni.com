// lib/media/keys.ts
/**
 * Storage key rules shared by the site and the media worker.
 *
 * Pure string functions: no environment, no database, no SDK. The browser, the server and the worker all import this
 * file, which replaces the "contract kept in step by hand" the two repositories used to have (the worker was in
 * Python, and every rule here existed twice).
 *
 * A photo is uploaded to a staging prefix and the worker turns it into an AVIF master under the matching `public/` key.
 * A photo uploaded before the worker handled photos sits directly at its public key: it is recognised by *not* being
 * staged, and served exactly as before.
 */

/** Widths of the responsive renditions cut beside every photo master; lib/photo-loader.ts picks among them. */
export const RENDITION_WIDTHS = [480, 960, 1600] as const

export const PHOTO_STAGING_PREFIXES = ['private/route-photos/', 'private/bike-model-photos/'] as const
export const PHOTO_PUBLIC_PREFIXES = ['public/route-photos/', 'public/bike-model-photos/'] as const

/** Formats the worker can decode; anything else would sit in staging forever. */
export const PHOTO_SOURCE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff', 'heic', 'heif'] as const
export type PhotoSourceExtension = (typeof PHOTO_SOURCE_EXTENSIONS)[number]

export const VIDEO_STAGING_PREFIXES = ['private/route-videos/', 'private/bike-model-videos/'] as const
export const VIDEO_SOURCE_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] as const

/**
 * Manifest names the worker may have produced, most capable first. Adaptive bitrate is `master.m3u8` in the stream's
 * root; videos transcoded before that still only have the flat `playlist.m3u8`, so both have to be accepted.
 */
export const HLS_MANIFESTS = ['master.m3u8', 'playlist.m3u8'] as const

/** Lower-cased extension of the last path segment, or an empty string. */
export function extensionOf(key: string): string {
  const name = key.slice(key.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** A `.` or `..` segment: a key that climbs out of its folder wherever it is turned into a path. Real keys have none. */
function hasDotSegment(key: string): boolean {
  return key.split('/').some((segment) => segment === '.' || segment === '..')
}

export function isStagedPhotoKey(key: string): boolean {
  return PHOTO_STAGING_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** A staged photo the worker should turn into a master: the right prefix and a format it can decode. */
export function isPhotoSourceKey(key: string): boolean {
  return (
    isStagedPhotoKey(key) &&
    !hasDotSegment(key) &&
    (PHOTO_SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(key))
  )
}

export function isVideoSourceKey(key: string): boolean {
  return (
    VIDEO_STAGING_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    !hasDotSegment(key) &&
    (VIDEO_SOURCE_EXTENSIONS as readonly string[]).includes(extensionOf(key))
  )
}

function stemOf(key: string): string {
  const dot = key.lastIndexOf('.')
  return dot > key.lastIndexOf('/') ? key.slice(0, dot) : key
}

/** private/route-photos/{owner}/{uuid}.jpg → public/route-photos/{owner}/{uuid}.avif; any other key is already public. */
export function photoPublicKey(storageKey: string): string {
  if (!isStagedPhotoKey(storageKey)) return storageKey
  return 'public/' + stemOf(storageKey).slice('private/'.length) + '.avif'
}

/** The master a worker writes for a staging key. Throws for anything that is not under `private/`. */
export function photoMasterKeyFor(sourceKey: string): string {
  if (!sourceKey.startsWith('private/')) throw new Error(`not a staging key: ${sourceKey}`)
  return 'public/' + stemOf(sourceKey).slice('private/'.length) + '.avif'
}

/**
 * The small JPEG the worker writes beside a staged photo's master, for link previews only: WhatsApp, Facebook and
 * LinkedIn do not read AVIF. A photo that predates the worker already is a JPEG, PNG or WebP and stands in for itself.
 */
export function photoShareKey(storageKey: string): string {
  const key = photoPublicKey(storageKey)
  return isStagedPhotoKey(storageKey) ? key.replace(/\.avif$/, '.share.jpg') : key
}

const RENDITION_SUFFIX = /\.w\d+\.avif$/

/** A processed photo's master: not a rendition, not a link-preview JPEG, not anything else. */
export function isMasterKey(key: string): boolean {
  return (
    PHOTO_PUBLIC_PREFIXES.some((prefix) => key.startsWith(prefix)) &&
    !hasDotSegment(key) &&
    key.endsWith('.avif') &&
    !RENDITION_SUFFIX.test(key)
  )
}

/** public/route-photos/{owner}/{uuid}.avif → public/route-photos/{owner}/{uuid}.w{width}.avif */
export function photoRenditionKey(masterKey: string, width: number): string {
  if (!isMasterKey(masterKey)) throw new Error(`not a master key: ${masterKey}`)
  return masterKey.replace(/\.avif$/, `.w${width}.avif`)
}

/** The renditions of a staged photo, as keys, so that deleting a photo can take them along. Photos from before the worker have none. */
export function photoRenditionKeys(storageKey: string): string[] {
  if (!isStagedPhotoKey(storageKey)) return []
  const master = photoPublicKey(storageKey)
  return RENDITION_WIDTHS.map((width) => photoRenditionKey(master, width))
}

/** private/route-videos/{routeId}/{uuid}.ext → public/route-videos/{routeId}/{uuid}/ */
export function deriveHlsPrefix(privateKey: string): string {
  return privateKey.replace(/^private\//, 'public/').replace(/\.[^.]+$/, '') + '/'
}
