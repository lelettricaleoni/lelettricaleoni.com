// scripts/build-worker.mjs
// Bundles the worker (and the few site files it shares) into dist/worker/worker.mjs.
// `sharp` and `libheif-js` stay out of the bundle: sharp is native, libheif-js loads a .wasm file next to itself.
// dist/worker/package.json lists just those two, with the versions of the site's package.json, so the image installs
// nothing else.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const external = ['sharp', 'libheif-js']

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
      dependencies: Object.fromEntries(external.map((name) => [name, pkg.dependencies[name]])),
    },
    null,
    2,
  ) + '\n',
)
console.log('worker written to dist/worker/')
