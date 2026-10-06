// worker/scripts/spike-heic.mjs
// Throwaway: the outcome goes in docs/ai/ideas/heic-decode-spike.md, this file is not part of the product.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import sharp from 'sharp'

const require = createRequire(import.meta.url)
const libheif = require('libheif-js')

const file = process.argv[2]
if (!file) throw new Error('usage: node worker/scripts/spike-heic.mjs <file.heic> [out.avif]')

const started = performance.now()
const [image] = new libheif.HeifDecoder().decode(readFileSync(file))
if (!image) throw new Error('the file holds no image')
const width = image.get_width()
const height = image.get_height()
const rgba = new Uint8ClampedArray(width * height * 4)
await new Promise((resolve, reject) => {
  image.display({ data: rgba, width, height }, (result) => (result ? resolve(result) : reject(new Error('libheif could not decode'))))
})
const decoded = performance.now()

const out = await sharp(Buffer.from(rgba.buffer), { raw: { width, height, channels: 4 } })
  .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
  .avif({ quality: 65, effort: 3 })
  .toFile(process.argv[3] ?? 'spike-out.avif')
const encoded = performance.now()

console.log(JSON.stringify({
  file, width, height,
  decodeMs: Math.round(decoded - started),
  encodeMs: Math.round(encoded - decoded),
  rssMb: Math.round(process.memoryUsage().rss / 1048576),
  outputBytes: out.size, outWidth: out.width, outHeight: out.height,
}, null, 2))
