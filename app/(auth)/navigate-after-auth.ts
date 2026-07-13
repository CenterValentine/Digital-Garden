import { isNativeShell } from '@/lib/mobile-bridge/client'

/** Minimal shape of the Next.js router we need — avoids importing internals. */
type SoftRouter = { push: (href: string) => void; refresh: () => void }

/**
 * Navigate to the post-auth destination after a successful sign-in / sign-up.
 *
 * Desktop browsers: a soft client navigation (router.push + refresh) is fine —
 * the session cookie set on the auth fetch() response is attached to the
 * follow-up RSC request.
 *
 * Native WebView shell: WKWebView does NOT reliably attach a cookie set on a
 * fetch() response to the immediately-following soft navigation, so the
 * proxy/session check on the destination runs cookie-less and bounces back to
 * /sign-in. A full document load sends the now-stored cookie with the
 * top-level request. Guarded by isNativeShell() so desktop is unchanged.
 */
export function navigateAfterAuth(target: string, router: SoftRouter): void {
  if (isNativeShell()) {
    window.location.assign(target)
    return
  }
  router.push(target)
  router.refresh()
}
