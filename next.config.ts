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
    // What the admin edits: the routes and bikes lists, their details and the
    // suggestions between them.
    //
    // `updateTag` after an admin action expires the entry only in the serverless
    // instance that ran the action. The default `'use cache'` store is in memory,
    // per instance, so every other warm instance keeps serving its own copy until
    // it goes stale on its own. With the old 30s/120s, reordering the bikes in the
    // panel and reloading the public list could show the old order for up to two
    // minutes — "the order has no effect", reported on 2026-09-25 with the
    // database already right. Short lifetimes bound that lag to about half a
    // minute; the reads are one query each, so the cost is negligible.
    //
    // `stale: 0` keeps the browser from reusing its own copy without asking.
    catalog: {
      stale: 0,
      revalidate: 10,
      expire: 30,
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
