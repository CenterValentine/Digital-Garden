"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    __dgExtensionFocusFetchPatched?: boolean;
    __dgExtensionFocusToken?: string | null;
    __dgExtensionFocusOriginalFetch?: typeof window.fetch;
  }
}

function shouldAttachAuth(input: RequestInfo | URL) {
  const value =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  if (value.startsWith("/api/")) return true;

  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function ExtensionFocusBridge() {
  const searchParams = useSearchParams();
  const isExtensionFocus = searchParams.get("extension") === "1";

  useEffect(() => {
    if (!isExtensionFocus) return;

    const originalFetch =
      window.__dgExtensionFocusOriginalFetch ?? window.fetch.bind(window);
    window.__dgExtensionFocusOriginalFetch = originalFetch;

    if (!window.__dgExtensionFocusFetchPatched) {
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const token = window.__dgExtensionFocusToken;
        if (!token || !shouldAttachAuth(input)) {
          return originalFetch(input, init);
        }

        const headers = new Headers(init?.headers || {});
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${token}`);
        }

        return originalFetch(input, {
          ...init,
          headers,
          credentials: init?.credentials ?? "omit",
        });
      };
      window.__dgExtensionFocusFetchPatched = true;
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "dg-extension-auth") return;
      if (!event.data?.token || typeof event.data.token !== "string") return;
      window.__dgExtensionFocusToken = event.data.token;
    };

    window.addEventListener("message", handleMessage);
    window.parent?.postMessage({ type: "dg-overlay-ready" }, "*");

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isExtensionFocus]);

  return null;
}
