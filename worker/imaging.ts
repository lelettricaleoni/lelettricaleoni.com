// worker/imaging.ts
import sharp, { type Sharp } from 'sharp'
import { RENDITION_WIDTHS } from '@/lib/media/keys'
import type { ImagingConfig } from './config'

/**
 * Photo processing: any accepted source in, one AVIF master out, plus the link preview and the renditions.
 *
 * The source is decoded once, fitted and oriented, and held as a lossless intermediate in memory; every output is cut
 * from that, never from the source again (a second decode of a 120 MB TIFF) and never through a lossy step.
 */

/** Pillow refused anything above ~89 MP; a 120 MB manufacturer TIFF needs more, and a decompression bomb still fails. */
export const PIXEL_LIMIT = 300_000_000

/** Decoded pixels (HEIC goes this way), handed to sharp as raw RGBA. */
export interface RawImage {
  data: Buffer
  width: number
  height: number
}

export interface PhotoOutputs {
  master: string
  share: string
  /** width → path, one for every width in RENDITION_WIDTHS */
  renditions: Record<number, string>
}

function open(source: string | RawImage): Sharp {
  if (typeof source === 'string') return sharp(source, { limitInputPixels: PIXEL_LIMIT, failOn: 'error' })
  const image = sharp(source.data, {
    raw: { width: source.width, height: source.height, channels: 4 },
    limitInputPixels: PIXEL_LIMIT,
  })
  // libheif always hands over RGBA, opaque for a phone photo. Keeping that alpha would put a transparency plane in every
  // master (about a fifth heavier on a small photo) for nothing.
  return isOpaque(source.data) ? image.removeAlpha() : image
}

function isOpaque(rgba: Buffer): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return false
  return true
}

export async function renderPhoto(
  source: string | RawImage,
  outputs: PhotoOutputs,
  config: ImagingConfig,
): Promise<{ width: number; height: number }> {
  const input = open(source)
  const { space } = await input.metadata()

  // A profile describes RGB data. It travels with data that stays RGB (sRGB-tagged photos, wide-gamut phones); anything
  // else (CMYK, greyscale, 16-bit) is converted to sRGB first, because a CMYK profile on RGB pixels would be wrong.
  const staysRgb = space === 'srgb'
  const oriented = input.rotate()
  const prepared = staysRgb ? oriented.keepIccProfile() : oriented.toColourspace('srgb')

  const { data: intermediate, info } = await prepared
    .resize({ width: config.maxEdge, height: config.maxEdge, fit: 'inside', withoutEnlargement: true })
    .tiff({ compression: 'lzw' })
    .toBuffer({ resolveWithObject: true })

  const avif = (width?: number) => {
    const image = sharp(intermediate).keepIccProfile()
    return (width ? image.resize({ width, withoutEnlargement: true }) : image).avif({
      quality: config.quality,
      effort: config.effort,
    })
  }

  await avif().toFile(outputs.master)
  for (const width of RENDITION_WIDTHS) await avif(width).toFile(outputs.renditions[width])
  await sharp(intermediate)
    .keepIccProfile()
    .resize({ width: config.shareEdge, height: config.shareEdge, fit: 'inside', withoutEnlargement: true })
    // JPEG has no alpha: a transparent background would turn black.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: config.shareQuality })
    .toFile(outputs.share)

  return { width: info.width, height: info.height }
}

/** Cut the renditions from an already written master (the backfill and "reprocess"). Returns the master's size. */
export async function cutRenditions(
  masterPath: string,
  paths: Record<number, string>,
  config: ImagingConfig,
): Promise<{ width: number; height: number }> {
  const { width = 0, height = 0 } = await sharp(masterPath).metadata()
  for (const target of RENDITION_WIDTHS) {
    await sharp(masterPath)
      .keepIccProfile()
      .resize({ width: target, withoutEnlargement: true })
      .avif({ quality: config.quality, effort: config.effort })
      .toFile(paths[target])
  }
  return { width, height }
}
