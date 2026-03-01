/**
 * Default Settings Middleware
 *
 * Re-exports the AI SDK's built-in defaultSettingsMiddleware with a
 * DG-specific wrapper for our common use case (temperature + maxOutputTokens).
 *
 * The SDK's middleware is V3-compliant and handles specificationVersion
 * automatically. We wrap it to keep a stable interface for our chat route.
 */

import {
  defaultSettingsMiddleware as sdkDefaultSettings,
  type LanguageModelMiddleware,
} from "ai";

/**
 * Creates a middleware that injects default temperature and maxOutputTokens
 * when not specified per-request. Delegates to AI SDK's built-in implementation.
 */
export function defaultSettingsMiddleware(settings: {
  temperature?: number;
  maxTokens?: number;
}): LanguageModelMiddleware {
  return sdkDefaultSettings({
    settings: {
      temperature: settings.temperature,
      maxOutputTokens: settings.maxTokens,
    },
  });
}
