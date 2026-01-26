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
  // Empty turbopack config to silence warning about webpack config
  turbopack: {},
};

export default nextConfig;
