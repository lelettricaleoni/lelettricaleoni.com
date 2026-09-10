import type { NextConfig } from "next"

const nextConfig: NextConfig = {
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
        hostname: 'dev-lelettrica-trails.lelettricaleoni.com',
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
