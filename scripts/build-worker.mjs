// scripts/build-worker.mjs
// Bundles the worker (and the few site files it shares) into dist/worker/worker.mjs.
// `sharp` and `libheif-js` stay out of the bundle: sharp is native, libheif-js loads a .wasm file next to itself.
// dist/worker/package.json lists just those two, each at the exact version `npm ci` installed here (the one
// package-lock.json pins), so the image gets what was tested and not whatever a range resolves to on build day.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const external = ['sharp', 'libheif-js']

const installedVersion = (name) => JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8')).version

mkdirSync('dist/worker', { recursive: true })

await build({
  entryPoints: ['worker/main.ts'],
  outfile: 'dist/worker/worker.mjs',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  external,
  // The CommonJS packages in the bundle call require(); give them one.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  logLevel: 'info',
})

writeFileSync(
  'dist/worker/package.json',
  JSON.stringify(
    {
      name: 'lelettrica-media-worker',
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(external.map((name) => [name, installedVersion(name)])),
    },
    null,
    2,
  ) + '\n',
)
console.log('worker written to dist/worker/')
