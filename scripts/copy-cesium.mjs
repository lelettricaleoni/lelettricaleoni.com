import { cpSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/cesium/Build/Cesium')
const dest = join(root, 'public/cesium')

if (!existsSync(src)) {
  console.warn(`⚠ ${src} non trovato — skip`)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })

// Cesium.js is loaded via script tag (not bundled by webpack) to avoid SWC
// choking on GLSL shaders with octal escape sequences
cpSync(join(src, 'Cesium.js'), join(dest, 'Cesium.js'))

for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  const srcDir = join(src, dir)
  if (!existsSync(srcDir)) {
    console.warn(`⚠ ${dir} non trovato — skip`)
    continue
  }
  mkdirSync(join(dest, dir), { recursive: true })
  cpSync(srcDir, join(dest, dir), { recursive: true })
}

console.log('✓ Cesium assets copiati in public/cesium/')
