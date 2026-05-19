/**
 * Feature Routing — Session 3.6 barrel export.
 *
 * Public surface:
 *   - FEATURE_REGISTRY        — the list of registered features
 *   - lookupFeature           — resolve a feature spec by id
 *   - resolveFeatureRoute     — get ordered routes for (user, feature)
 *   - resolvePrimaryRoute     — get just the primary route
 *   - executeWithFallback     — run an AI call with backup chain
 *   - listCompatibleModels    — filter a connection's models by required caps
 */

export {
  CAPABILITY_DISPLAY,
  FEATURE_BY_ID,
  FEATURE_REGISTRY,
  lookupFeature,
  type CapabilityFlag,
  type FeatureSpec,
} from "./registry";

export {
  listCompatibleModels,
  resolveFeatureRoute,
  resolvePrimaryRoute,
  type ResolvedRoute,
} from "./router";

export {
  AllRoutesExhaustedError,
  executeWithFallback,
  isRetriable,
  NoRoutesAvailableError,
  type ExecuteAttemptContext,
  type ExecuteWithFallbackOptions,
} from "./execute-with-fallback";
