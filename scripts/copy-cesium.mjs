import { cpSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/cesium/Build/Cesium')
const dest = join(root, 'public/cesium')

if (!existsSync(src)) {
  console.warn(`⚠ ${src} non trovato — skip (Cesium viene bundlato da webpack)`)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })

// Cesium.js non serve: viene importato e bundlato da webpack
// Copia solo le risorse statiche necessarie a runtime
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
