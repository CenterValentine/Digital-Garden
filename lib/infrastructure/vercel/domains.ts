/**
 * Vercel Domains API wrapper.
 *
 * Used by the custom-hostname claiming flow (Settings → Sites → Hosts).
 * Each function is a thin HTTP call to Vercel's REST API; we don't
 * cache results because Vercel is the source of truth for verification
 * state.
 *
 * Required env vars:
 *   VERCEL_API_TOKEN   — bearer token (project or team scoped)
 *   VERCEL_PROJECT_ID  — which project to add domains to
 *   VERCEL_TEAM_ID     — optional, set when project is on a team
 *
 * When VERCEL_API_TOKEN is missing, every function throws
 * VercelDomainsUnavailableError. Routes catch and return a clear 503
 * error so the UI can fall back to a "contact admin" message rather
 * than appearing broken.
 */

import { logger } from "@/lib/core/logger/emit";
import { withSpan } from "@/lib/core/logger/span";

const VERCEL_API_BASE = "https://api.vercel.com";

export class VercelDomainsUnavailableError extends Error {
  constructor() {
    super(
      "Vercel Domains API not configured (missing VERCEL_API_TOKEN or VERCEL_PROJECT_ID)",
    );
    this.name = "VercelDomainsUnavailableError";
  }
}

export class VercelDomainsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "VercelDomainsApiError";
  }
}

export type VercelVerification = {
  type: string;
  domain: string;
  value: string;
  reason: string;
};

export type VercelDomain = {
  name: string;
  apexName: string;
  projectId: string;
  redirect: string | null;
  redirectStatusCode: number | null;
  gitBranch: string | null;
  updatedAt: number;
  createdAt: number;
  verified: boolean;
  verification: VercelVerification[];
};

export type VercelDomainConfig = {
  configuredBy: "CNAME" | "A" | "http" | null;
  acceptedChallenges: string[] | null;
  misconfigured: boolean;
};

function getCreds(): { token: string; projectId: string; teamId?: string } {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) {
    throw new VercelDomainsUnavailableError();
  }
  const teamId = process.env.VERCEL_TEAM_ID;
  return { token, projectId, teamId };
}

function buildUrl(path: string, teamId?: string): string {
  const base = `${VERCEL_API_BASE}${path}`;
  return teamId ? `${base}?teamId=${encodeURIComponent(teamId)}` : base;
}

async function vercelFetch<T>(
  path: string,
  init?: RequestInit & { teamId?: string },
): Promise<T> {
  const { token, teamId } = getCreds();
  const fullTeamId = init?.teamId ?? teamId;
  const url = buildUrl(path, fullTeamId);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    const message = body.error?.message ?? `Vercel API ${res.status}`;
    const code = body.error?.code;
    throw new VercelDomainsApiError(message, res.status, code);
  }
  return res.json() as Promise<T>;
}

/**
 * Add a domain to the Vercel project. Returns the domain record with
 * verification challenges populated. Vercel auto-provisions an SSL
 * certificate once DNS resolves correctly.
 */
export async function addDomain(host: string): Promise<VercelDomain> {
  return withSpan(
    { layer: "route", name: "vercel:domain:add" },
    { attrs: { host } },
    async () => {
      const { projectId } = getCreds();
      try {
        const domain = await vercelFetch<VercelDomain>(
          `/v10/projects/${encodeURIComponent(projectId)}/domains`,
          {
            method: "POST",
            body: JSON.stringify({ name: host }),
          },
        );
        logger.info({
          layer: "route",
          event: "vercel:domain:add:ok",
          attrs: { host, verified: domain.verified },
        });
        return domain;
      } catch (err) {
        // 409 from Vercel = already on this project (or a sibling) —
        // treat as "fetch the existing record and return it."
        if (err instanceof VercelDomainsApiError && err.status === 409) {
          logger.info({
            layer: "route",
            event: "vercel:domain:add:already_exists",
            attrs: { host },
          });
          return getDomain(host);
        }
        throw err;
      }
    },
  );
}

/**
 * Remove a domain from the Vercel project.
 */
export async function removeDomain(host: string): Promise<void> {
  return withSpan(
    { layer: "route", name: "vercel:domain:remove" },
    { attrs: { host } },
    async () => {
      const { projectId } = getCreds();
      try {
        await vercelFetch<void>(
          `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}`,
          { method: "DELETE" },
        );
      } catch (err) {
        // 404 = already gone, idempotent success.
        if (err instanceof VercelDomainsApiError && err.status === 404) {
          return;
        }
        throw err;
      }
    },
  );
}

/**
 * Get the current state of a domain on the Vercel project — verified
 * flag, DNS records, etc.
 */
export async function getDomain(host: string): Promise<VercelDomain> {
  const { projectId } = getCreds();
  return vercelFetch<VercelDomain>(
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}`,
  );
}

/**
 * Get the DNS configuration status (whether the domain's DNS records
 * are pointing at Vercel correctly).
 */
export async function getDomainConfig(
  host: string,
): Promise<VercelDomainConfig> {
  const { projectId } = getCreds();
  return vercelFetch<VercelDomainConfig>(
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}/config`,
  );
}

/**
 * Trigger Vercel to re-check the domain's verification status. Called
 * after the user has set up DNS records and wants to confirm.
 */
export async function verifyDomain(host: string): Promise<VercelDomain> {
  return withSpan(
    { layer: "route", name: "vercel:domain:verify" },
    { attrs: { host } },
    async () => {
      const { projectId } = getCreds();
      const domain = await vercelFetch<VercelDomain>(
        `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(host)}/verify`,
        { method: "POST" },
      );
      logger.info({
        layer: "route",
        event: "vercel:domain:verify:result",
        attrs: { host, verified: domain.verified },
      });
      return domain;
    },
  );
}

/**
 * Combined readiness check. Vercel splits this signal into two API
 * calls: `domain.verified` (ownership) and `domainConfig.misconfigured`
 * (DNS-actually-pointing-at-us). A domain is genuinely ready to route
 * only when BOTH ownership is confirmed AND DNS is configured. Marking
 * `verifiedAt` based on just `verified` (the original bug) misleads
 * users into thinking DNS is set when it isn't.
 */
export async function checkDomainReadiness(host: string): Promise<{
  domain: VercelDomain;
  config: VercelDomainConfig;
  /** True iff the domain is owned AND DNS resolves to Vercel. */
  isReady: boolean;
}> {
  const [domain, config] = await Promise.all([
    getDomain(host),
    getDomainConfig(host).catch(
      (): VercelDomainConfig => ({
        configuredBy: null,
        acceptedChallenges: null,
        misconfigured: true,
      }),
    ),
  ]);
  return {
    domain,
    config,
    isReady: domain.verified && !config.misconfigured,
  };
}

/**
 * Build user-facing DNS instructions from a Vercel domain record.
 * Returns a small structured description the UI can render.
 */
export function describeDnsRequirements(domain: VercelDomain): {
  recordType: "CNAME" | "A";
  recordName: string;
  recordValue: string;
  rationale: string;
}[] {
  const isApex = domain.name === domain.apexName;
  // Apex domains need A records; subdomains use CNAME.
  // IP value reflects Vercel's current recommended range (216.198.79.1)
  // following their 2026 IP expansion. The legacy IP (76.76.21.21)
  // still resolves but their config-check API may report it as
  // misconfigured. Future improvement: fetch the actual required
  // records from Vercel's API (`getDomainConfig` / domain.verification)
  // rather than hardcoding, so we automatically pick up future changes.
  if (isApex) {
    return [
      {
        recordType: "A",
        recordName: "@",
        recordValue: "216.198.79.1",
        rationale:
          "Point your apex domain at Vercel via an A record. (Apex domains can't use CNAME.)",
      },
    ];
  }
  return [
    {
      recordType: "CNAME",
      recordName: domain.name.split(".")[0] ?? "@",
      recordValue: "cname.vercel-dns.com",
      rationale:
        "Point your subdomain at Vercel via a CNAME record. Vercel will auto-provision an SSL cert once DNS resolves.",
    },
  ];
}
