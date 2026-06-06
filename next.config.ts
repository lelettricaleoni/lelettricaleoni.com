import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Cesium is loaded via script tag (UMD global) to avoid SWC parsing GLSL shaders
    // with octal escape sequences — this maps `import cesium` to window.Cesium
    config.externals = [...(config.externals ?? []), { cesium: 'Cesium' }]
    return config
  },
  images: {
    qualities: [75, 80, 82, 100],
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
