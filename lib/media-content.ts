import { fileTypeFromBlob } from 'file-type'

/**
 * Whether a file really is what it is being uploaded as, read from its first bytes before anything is sent.
 *
 * The extension and the type a browser reports come from the name, so they say nothing about a damaged file: a PNG
 * whose first byte was overwritten still ends in `.png`, goes up to the bucket, and the worker then cannot read it (three
 * such files sat in production until 2026-10-07, each failing three attempts). Reading the signature catches that while
 * the person who chose the file is still looking at it.
 *
 * Safe to import from client components. The signatures come from `file-type`, not from a list kept here.
 */

/** Exactly the image formats the worker decodes (lib/media/keys.ts, PHOTO_SOURCE_EXTENSIONS). */
const PHOTO_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'image/heic', 'image/heif']

export type MediaContentCheck = { ok: true } | { ok: false; reason: string }

export async function checkMediaContent(file: File, kind: 'photo' | 'video'): Promise<MediaContentCheck> {
  let mime: string | undefined
  try {
    mime = (await fileTypeFromBlob(file))?.mime
  } catch {
    mime = undefined
  }

  const valid = kind === 'photo' ? mime !== undefined && PHOTO_MIME_TYPES.includes(mime) : mime?.startsWith('video/') === true
  if (valid) return { ok: true }

  return {
    ok: false,
    reason:
      kind === 'photo'
        ? 'this is not a valid photo (JPEG, PNG, WebP, TIFF or HEIC): the file may be damaged or of another kind'
        : 'this is not a valid video: the file may be damaged or of another kind',
  }
}
