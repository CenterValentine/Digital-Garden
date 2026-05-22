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
    // JSDOM (used by components/public/TipTapContent.tsx to server-render
    // TipTap JSON via ProseMirror's DOMSerializer). Large dep, no benefit
    // to bundling. Note: jsdom is also pinned to ^26.1.0 in package.json
    // because jsdom@27+ pulls in @exodus/bytes (ESM-only) which crashes
    // with ERR_REQUIRE_ESM on Vercel's Rust runtime loader regardless of
    // bundler externalization (the first attempt at 8c6eca8 just added
    // these entries and it kept failing — see davidvalentine.org/blog/*
    // page_render:failed traces on 2026-05-21). Keep the version pin in
    // place; revisit when @exodus/bytes ships a CJS shim or Vercel's
    // loader supports require(esm) for top-level-await-free modules.
    'jsdom',
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
        'jsdom',
      ];
    }
    return config;
  },
  // Security headers for visualization iframes
  async headers() {
    return [
      {
        // Apply CSP to visualization routes
        source: "/content/visualization/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow diagrams.net iframe
              "frame-src https://embed.diagrams.net https://*.diagrams.net",
              // Allow inline scripts for React and Next.js
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              // Allow inline styles for Tailwind CSS
              "style-src 'self' 'unsafe-inline'",
              // Allow images from diagrams.net CDN
              "img-src 'self' data: https: blob:",
              // Allow connections to API
              "connect-src 'self'",
            ].join("; "),
          },
        ],
      },
      {
        source: "/extension-overlay/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' http: https:",
              "frame-ancestors *",
            ].join("; "),
          },
        ],
      },
      {
        // Embed routes are loaded inside the browser extension iframe
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https: blob:",
              "connect-src 'self' http: https: wss: ws:",
              "frame-src https://embed.diagrams.net https://*.diagrams.net",
              "frame-ancestors *",
            ].join("; "),
          },
        ],
      },
    ];
  },
  // Pin local dev to the active worktree. Without this, nested worktrees can
  // make Turbopack infer the parent repository as the workspace root.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
