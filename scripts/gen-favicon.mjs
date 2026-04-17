import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const svgPath = join(root, 'public', 'svg', 'LogoLelettrica_simpleIcon.svg')
const outIco = join(root, 'app', 'favicon.ico')

const svg = await readFile(svgPath)

// Add explicit width/height to the SVG so sharp rasterises the full drawing
const svgWithSize = svg
  .toString()
  .replace('<svg ', '<svg width="256" height="256" ')

const sizes = [16, 32, 48]
const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(Buffer.from(svgWithSize))
      .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
)

// Build ICO file (PNG-in-ICO, supported since Windows Vista / all modern browsers)
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4) // image count

const entries = []
let offset = 6 + 16 * sizes.length

for (let i = 0; i < sizes.length; i++) {
  const entry = Buffer.alloc(16)
  const s = sizes[i]
  entry.writeUInt8(s === 256 ? 0 : s, 0) // width
  entry.writeUInt8(s === 256 ? 0 : s, 1) // height
  entry.writeUInt8(0, 2) // colors in palette
  entry.writeUInt8(0, 3) // reserved
  entry.writeUInt16LE(1, 4) // color planes
  entry.writeUInt16LE(32, 6) // bit depth
  entry.writeUInt32LE(pngs[i].length, 8) // image data size
  entry.writeUInt32LE(offset, 12) // offset
  entries.push(entry)
  offset += pngs[i].length
}

const ico = Buffer.concat([header, ...entries, ...pngs])
await writeFile(outIco, ico)
console.log(`Wrote ${outIco} (${ico.length} bytes, sizes: ${sizes.join(', ')})`)
