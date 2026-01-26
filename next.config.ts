import type { NextConfig } from "next";

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
};

export default nextConfig;
