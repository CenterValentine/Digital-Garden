import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  // Exclude FFmpeg from server component bundling (Next.js 16+)
  serverExternalPackages: [
    'fluent-ffmpeg',
    '@ffmpeg-installer/ffmpeg',
    '@ffmpeg-installer/darwin-arm64',
    '@ffmpeg-installer/linux-x64',
    '@ffmpeg-installer/win32-x64',
  ],
  // Fix Turbopack workspace root detection in monorepo
  // Point to monorepo root (two levels up from apps/web)
  turbopack: {
    root: path.resolve(__dirname, '../..'),
  },
};

export default nextConfig;
