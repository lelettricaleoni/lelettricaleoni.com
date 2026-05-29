import { cpSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/cesium/Build/Cesium')
const dest = join(root, 'public/cesium')

for (const dir of ['Workers', 'ThirdParty', 'Assets', 'Widgets']) {
  mkdirSync(join(dest, dir), { recursive: true })
  cpSync(join(src, dir), join(dest, dir), { recursive: true })
}

console.log('✓ Cesium assets copiati in public/cesium/')
