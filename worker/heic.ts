// worker/heic.ts
import { createRequire } from 'node:module'
import { extensionOf } from '@/lib/media/keys'
import { PIXEL_LIMIT, type RawImage } from './imaging'

/**
 * HEIC, what an iPhone produces. The precompiled sharp cannot decode its HEVC video codec (patents), so the file is
 * decoded here, with libheif compiled to WebAssembly, and handed to sharp as raw pixels. libheif applies the rotation
 * the file asks for, so a portrait shot arrives upright.
 */

const require = createRequire(import.meta.url)

interface HeifImage {
  get_width(): number
  get_height(): number
  display(target: { data: Uint8ClampedArray; width: number; height: number }, done: (result: unknown) => void): void
}
interface Libheif {
  HeifDecoder: new () => { decode(file: Buffer): HeifImage[] }
}

let libheif: Libheif | undefined
export function loadLibheif(): Libheif {
  return (libheif ??= require('libheif-js') as Libheif)
}

export function isHeicKey(key: string): boolean {
  const ext = extensionOf(key)
  return ext === 'heic' || ext === 'heif'
}

/**
 * The size is known before any pixel is: refuse an image that would need more than the limit every other format has,
 * before the RGBA buffer (four bytes a pixel) is allocated. sharp's own limit only applies after this buffer exists.
 */
export function assertWithinPixelLimit(width: number, height: number): void {
  if (width * height > PIXEL_LIMIT) throw new Error(`The HEIC image has too many pixels: ${width}x${height}`)
}

export async function decodeHeic(file: Buffer): Promise<RawImage> {
  const [image] = new (loadLibheif().HeifDecoder)().decode(file)
  if (!image) throw new Error('The HEIC file holds no image')

  const width = image.get_width()
  const height = image.get_height()
  assertWithinPixelLimit(width, height)
  const rgba = new Uint8ClampedArray(width * height * 4)
  await new Promise<void>((resolve, reject) => {
    image.display({ data: rgba, width, height }, (result) =>
      result ? resolve() : reject(new Error('libheif could not decode the image')),
    )
  })
  return { data: Buffer.from(rgba.buffer), width, height }
}
