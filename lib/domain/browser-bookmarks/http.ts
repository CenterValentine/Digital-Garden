import type { NextRequest } from "next/server";
import { validateBrowserExtensionToken } from "./auth";

export async function getOptionalBrowserExtensionBearerAuth(
  request: NextRequest
) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return null;
  }

  return validateBrowserExtensionToken(token);
}

export async function requireBrowserExtensionBearerAuth(request: NextRequest) {
  const record = await getOptionalBrowserExtensionBearerAuth(request);
  if (!record) {
    throw new Error("Missing bearer token");
  }
  return record;
}
