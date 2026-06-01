/**
 * Vercel AI Gateway provider integration.
 *
 * Used for non-BYOK calls: unified observability, retries on gateway
 * errors (ai-sdk 6.0.184+), zero data retention, one billing surface.
 *
 * BYOK calls bypass Gateway and use direct provider packages via
 * `resolveChatModel` in `./registry.ts`.
 *
 * Gateway auth is via the `AI_GATEWAY_API_KEY` env var (Vercel convention).
 * The `AI_USE_GATEWAY` env flag is the runtime kill switch — set to
 * "false" to force every non-BYOK call back onto direct providers.
 */

import "server-only";
import type { LanguageModel } from "ai";

/**
 * Whether to route non-BYOK calls through Vercel AI Gateway.
 *
 * **Default off.** Gateway uses a single `AI_GATEWAY_API_KEY` env var
 * that would be shared across all users of a multi-user deployment —
 * unacceptable for our hosted model. The app is strict-BYOK: each user
 * supplies their own provider API keys.
 *
 * Self-hosted single-user deployments may explicitly opt in by setting
 * `AI_USE_GATEWAY=true`, which unlocks the Gateway path for non-BYOK
 * requests. In that mode the deployment owner accepts that the Gateway
 * key bills/limits apply to every call.
 */
export function isGatewayEnabled(): boolean {
  return process.env.AI_USE_GATEWAY === "true";
}

/**
 * Resolves a provider config to a Gateway-routed LanguageModel.
 *
 * Gateway accepts `"provider/model"` strings; we forward the same
 * provider id + upstream model id pair the direct resolver uses.
 */
export async function resolveChatModelViaGateway(
  providerId: string,
  upstreamModelId: string,
): Promise<LanguageModel> {
  const { gateway } = await import("@ai-sdk/gateway");
  return gateway(`${providerId}/${upstreamModelId}`);
}
