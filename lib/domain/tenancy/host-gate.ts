/**
 * Platform-host gate.
 *
 * Phase 13: restrict surfaces that should ONLY work on PLATFORM_DOMAIN
 * (e.g. notetrellis.com), not on custom-host tenants like davidvalentine.org.
 *
 * The classic case: `/u/<slug>` routes resolve the tenant from the URL slug
 * regardless of the request host. Without this gate, `davidvalentine.org/u/anyone`
 * would render that user's content on the wrong domain — a clarity and
 * potentially reputational concern. Platform-domain-only surfaces stay
 * scoped to where they belong.
 *
 * Backward compatible: when PLATFORM_DOMAIN is unset (legacy single-tenant
 * deployments), the gate becomes a no-op so existing behavior continues.
 */

import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { normalizeHost } from "./resolve-tenant";

/**
 * 404s if the request isn't coming from the platform domain.
 * Call at the top of a route handler before any tenant resolution.
 */
export async function assertPlatformHost(): Promise<void> {
  const platformDomain = process.env.PLATFORM_DOMAIN?.trim().toLowerCase();
  if (!platformDomain) return;
  const host = normalizeHost((await headers()).get("host"));
  if (host !== platformDomain) {
    notFound();
  }
}
