import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Exclude native modules from server component bundling (Next.js 16+)
  serverExternalPackages: [
    // FFmpeg packages (video processing)
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffmpeg-installer/darwin-arm64',
    '@ffmpeg-installer/linux-x64',
    '@ffmpeg-installer/win32-x64',
    // Canvas (PDF processing)
    'canvas',
    // Sharp (image processing)
    'sharp',
  ],
  // Webpack configuration for production builds (Vercel uses --webpack flag)
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize native modules to prevent bundling
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals || {}]),
        'fluent-ffmpeg',
        '@ffmpeg-installer/ffmpeg',
        'canvas',
        'sharp',
      ];
    }
    return config;
  },
  // Empty turbopack config for local dev (uses Turbopack by default)
  turbopack: {},
};

export default nextConfig;
