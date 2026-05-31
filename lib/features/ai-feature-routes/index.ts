/**
 * AI Feature Routes — barrel.
 *
 * The service surface used by /api/ai/feature-routes and the
 * settings UI. Runtime resolution + fallback execution live in
 * `lib/domain/ai/features/`.
 */

export {
  clearFeatureRoutes,
  listAllUserRoutes,
  listFeatureRoutes,
  setFeatureRoutes,
  type FeatureRouteEntry,
  type FeatureRouteView,
} from "./service";
