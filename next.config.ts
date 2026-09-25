import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    globalNotFound: true,
  },
  // The social image reads the logo from disk. On Vercel the files in public/
  // are served by the CDN and are not in the function's bundle, so without this
  // the read fails with ENOENT and /opengraph-image answers 500 — as it did from
  // 2026-09-14, on every page, without a single preview showing an image.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./public/svg/LogoLelettrica_full.svg'],
  },
  cacheLife: {
    // Matches the ~30s in-memory TTL lib/flags.ts already uses, so a
    // kill-switch reaches visitors about as fast as it does today.
    routesFlags: {
      stale: 30,
      revalidate: 30,
      expire: 120,
    },
    // No flag decides what's in the sitemap — search engines already learn
    // a switched-off route is off from the noindex meta tag it serves
    // directly. Every actual change (publish, unpublish, unlist, delete)
    // calls updateTag('sitemap'), so this long TTL is only a safety net for
    // a mutation path that somehow misses that call, not the freshness
    // mechanism itself.
    sitemap: {
      stale: 3600,
      revalidate: 3600,
      expire: 86400,
    },
  },
  webpack: (config) => {
    // Cesium is loaded via script tag (UMD global) to avoid SWC parsing GLSL shaders
    // with octal escape sequences — this maps `import cesium` to window.Cesium
    config.externals = [...(config.externals ?? []), { cesium: 'Cesium' }]
    // The Playwright MCP server writes console logs and snapshots into
    // .playwright-mcp/ inside the project. Watching it creates a feedback loop:
    // the page logs, the log file changes, Fast Refresh rebuilds, the page logs again.
    //
    // Next has no config option for this, so we reach into the webpack config —
    // which its docs warn is outside semver. Its own default ignores node_modules,
    // .git and .next (baseWatchOptions in next/dist/build/webpack-config.js); we
    // restate those, because replacing `ignored` drops them. Only `--webpack`
    // builds run this hook: under Turbopack the loop would come back.
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/.next/**',
        '**/.playwright-mcp/**',
      ],
    }
    // @vercel/flags-core imports @vercel/flags-definitions, which it has never
    // published — the name 404s on npm. Production builds drop the branch, but
    // dev retries the resolution on every compile and logs the failure each
    // time. `false` tells webpack the module resolves to nothing, which is what
    // it already effectively is.
    config.resolve = {
      ...config.resolve,
      alias: { ...config.resolve?.alias, '@vercel/flags-definitions': false },
    }
    return config
  },
  images: {
    // 68 per le miniature delle card, che sono rese a ~313px; le altre
    // per le immagini a piena pagina.
    qualities: [68, 75, 80, 82, 100],
    // The photos the worker makes are AVIF masters, 2400 px wide. Vercel's
    // optimizer hands back an AVIF source untouched — same 2400 px, same bytes,
    // whatever `w` asks for — unless AVIF is among the output formats. Left at the
    // default (WebP only), a 340 px card downloaded 310 KB and the browser shrank
    // it seven times in one step, leaving jagged edges on thin lines like spokes.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'pub-*.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'trails-bucket.lelettricaleoni.com',
      },
      {
        protocol: 'https',
        hostname: 'dev-trails-bucket.lelettricaleoni.com',
      },
    ],
  },
  async redirects() {
    return [
      // Redirect vecchio PDF indicizzato da Google (vecchio sito)
      {
        source: '/assets/pdf/:file*',
        destination: '/pdf/Volantino 2023.pdf',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
