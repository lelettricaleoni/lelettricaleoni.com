import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.plugins.push(new webpack.DefinePlugin({ CESIUM_BASE_URL: JSON.stringify('/cesium') }))
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
