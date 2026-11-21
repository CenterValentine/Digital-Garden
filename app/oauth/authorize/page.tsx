/**
 * OAuth consent for MCP clients — the `authorization_endpoint` in
 * /.well-known/oauth-authorization-server (MCP-DATABASE-REACH-PLAN §8.1).
 *
 * Order matters: the request is checked BEFORE the session, so a malformed
 * request never bounces through sign-in, and an unregistered redirect URI is
 * never followed (RFC 6749 §4.1.2.1). Signed-out owners go to /sign-in with
 * the full authorize URL — query included — as the return path.
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/infrastructure/auth/session";
import { AUTHORIZE_PATH } from "@/lib/domain/mcp/oauth/discovery";
import { DEFAULT_OAUTH_TOKEN_DAYS, redirectTargetLabel } from "@/lib/domain/mcp/oauth/policy";
import {
  checkAuthorizeRequest,
  errorRedirectUrl,
  pickAuthorizeParams,
  publicOriginFromHeaders,
} from "@/lib/domain/mcp/oauth/authorize";
import { McpConsentForm } from "@/components/settings/mcp/McpConsentForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Connect an app — Digital Garden",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-12 text-foreground">
      <div className="w-full max-w-2xl rounded-xl border border-black/10 bg-background p-6 shadow-sm dark:border-white/10">
        {children}
      </div>
    </main>
  );
}

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = pickAuthorizeParams(await searchParams);
  const origin = publicOriginFromHeaders(await headers());
  const check = await checkAuthorizeRequest(params, origin);

  if (check.fatal || !check.client || !check.redirectUri) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">This connection request can&apos;t be completed</h1>
        <p className="mt-2 text-sm text-muted-foreground">{check.fatal ?? "The request is incomplete."}</p>
      </Shell>
    );
  }
  if (check.redirectError) {
    redirect(errorRedirectUrl(check.redirectUri, params.state, check.redirectError.error, check.redirectError.description));
  }

  const session = await getSession();
  if (!session) {
    const back = `${AUTHORIZE_PATH}?${new URLSearchParams(params as Record<string, string>).toString()}`;
    redirect(`/sign-in?redirect=${encodeURIComponent(back)}`);
  }

  return (
    <Shell>
      <McpConsentForm
        params={params as Record<string, string>}
        clientName={check.client.clientName}
        redirectTarget={redirectTargetLabel(check.redirectUri)}
        requested={check.requestedCapabilities}
        signedInAs={session.user.email ?? session.user.id}
        defaultExpiresDays={DEFAULT_OAUTH_TOKEN_DAYS}
      />
    </Shell>
  );
}
