/**
 * Runtime configuration for the mobile shell.
 *
 * The web origin is intentionally NOT hardcoded. Point the shell at a
 * different environment by setting EXPO_PUBLIC_DIGITAL_GARDEN_URL before
 * starting Expo, e.g.:
 *
 *   EXPO_PUBLIC_DIGITAL_GARDEN_URL=https://staging.davidvalentine.org/mobile npx expo start
 *
 * `EXPO_PUBLIC_*` vars are inlined into the JS bundle by Expo, so they're
 * readable on-device without any native config.
 */

/**
 * The URL the WebView loads on launch.
 *
 * Defaults to the local Next.js dev server. Note the port: this repo's
 * `pnpm dev` binds port 3015 (see package.json), NOT the generic 3000.
 *
 * iOS simulator can usually reach `localhost`. A physical device cannot —
 * use your machine's LAN IP instead, e.g.
 *   EXPO_PUBLIC_DIGITAL_GARDEN_URL=http://192.168.1.42:3015/mobile
 */
export const DEFAULT_WEB_URL =
  process.env.EXPO_PUBLIC_DIGITAL_GARDEN_URL ?? "http://localhost:3015/mobile";

/**
 * Origin (scheme + host + port) of the web app. Used to distinguish
 * "navigation inside our app" from "an outbound link to somewhere else".
 * Falls back to the raw URL string if parsing fails on an exotic value.
 */
export function getAppOrigin(url: string = DEFAULT_WEB_URL): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}
