// worker/testing/images.ts
import sharp from 'sharp'
import type { ImagingConfig } from '../config'

/** The production defaults, so that a test measures what production does. */
export const testImagingConfig: ImagingConfig = { maxEdge: 2400, quality: 65, effort: 3, shareEdge: 1200, shareQuality: 82 }

export interface ImageOptions {
  width: number
  height: number
  background?: { r: number; g: number; b: number; alpha?: number }
  channels?: 3 | 4
}

/** A plain-colour PNG of the given size, with or without transparency. */
export function makeImage({ width, height, background = { r: 10, g: 120, b: 200 }, channels = 3 }: ImageOptions): Promise<Buffer> {
  return sharp({ create: { width, height, channels, background } }).png().toBuffer()
}
