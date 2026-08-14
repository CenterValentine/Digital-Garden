import type { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Expo app config (TypeScript form so we can read env at build time).
 *
 * The web URL the shell loads is NOT baked in here — it's resolved at
 * runtime from `EXPO_PUBLIC_DIGITAL_GARDEN_URL` (see src/config.ts). This
 * config only carries native identity + iOS-friendly defaults.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Digital Garden",
  slug: "digital-garden-mobile",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "digitalgarden",
  userInterfaceStyle: "automatic",
  // (SDK 57 note: `newArchEnabled` was removed — the New Architecture is
  // always on and the opt-in flag no longer exists in ExpoConfig.)
  // Config plugins for modules that ship one. Required here because a dynamic
  // (app.config.ts) config can't be auto-edited by `expo install`. As of SDK
  // 57, expo-asset/expo-font plugins are built into expo itself; status-bar
  // and web-browser now ship their own (this is the exact list
  // `expo install --fix` prescribed on the 52→57 upgrade).
  plugins: ["expo-status-bar", "expo-web-browser"],
  ios: {
    // iPhone-first per the spike brief.
    bundleIdentifier: "com.centervalentine.digitalgarden",
    supportsTablet: true,
    // Allow http://localhost during development. Tighten/remove for the
    // production build, which should only ever load an https origin.
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: "com.centervalentine.digitalgarden",
  },
  extra: {
    // Surfaced via Constants.expoConfig.extra if a screen wants to show
    // which web origin it's pointed at (handy while testing local vs prod).
    webUrl: process.env.EXPO_PUBLIC_DIGITAL_GARDEN_URL ?? null,
  },
});
