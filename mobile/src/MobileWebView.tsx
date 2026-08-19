import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type {
  WebViewMessageEvent,
  WebViewNavigation,
} from "react-native-webview";

// Structural type for the onShouldStartLoadWithRequest arg. We only read
// `url`, so a minimal shape avoids a brittle deep import from the library's
// internal type paths (which move between versions).
type LoadRequest = { url: string };

import { DEFAULT_WEB_URL, getAppOrigin } from "./config";
import {
  handleWebToNativeMessage,
  shouldOpenExternally,
} from "./bridge/nativeBridge";
import { parseWebToNativeMessage } from "./bridge/messages";

interface MobileWebViewProps {
  /** Web URL to load. Defaults to the configured Digital Garden origin. */
  url?: string;
}

/**
 * The native shell. One full-screen WebView pointed at the existing Next.js
 * app, wrapped with the resilience a production shell needs:
 *   • safe-area padding (notch / home indicator)
 *   • loading spinner on first paint
 *   • error screen + retry when the page fails to load
 *   • pull-to-refresh
 *   • cookie/session persistence (so the web app's session_token survives)
 *   • external-link handling via the navigation policy in nativeBridge
 *   • content-process recovery: iOS reclaims WKWebView web processes under
 *     memory pressure while the app is backgrounded; without a handler the
 *     user returns to a white screen. We reload once automatically; a second
 *     kill within 30s means a memory-pressure loop, so we stop and show the
 *     error screen instead of thrashing.
 */

// Runs before each document loads. Marks the page as living inside the native
// shell so the web app can hide its desktop chrome (nav, padding) via a CSS
// rule keyed on `html[data-native-shell]`. The trailing `true;` is required:
// iOS WKWebView injection must evaluate to a non-object value.
const MARK_NATIVE_SHELL_JS = `
  (function () {
    try { document.documentElement.setAttribute('data-native-shell', 'true'); } catch (e) {}
  })();
  true;
`;

export function MobileWebView({ url = DEFAULT_WEB_URL }: MobileWebViewProps) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef<WebView>(null);
  const appOrigin = getAppOrigin(url);

  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  // Bumping this key forces a full remount of the WebView (used by retry).
  const [reloadKey, setReloadKey] = useState(0);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parseWebToNativeMessage(event.nativeEvent.data);
    if (!message) return;
    void handleWebToNativeMessage(message);
  }, []);

  // Decide whether a navigation stays in the WebView or is handed to the OS.
  const handleShouldStartLoad = useCallback(
    (request: LoadRequest): boolean => {
      if (shouldOpenExternally(request.url, appOrigin)) {
        // Reuse the same code path as web:open-external-url.
        void handleWebToNativeMessage({
          type: "web:open-external-url",
          url: request.url,
        });
        return false; // block in-WebView load
      }
      return true; // allow in-WebView load
    },
    [appOrigin]
  );

  const handleNavigationStateChange = useCallback(
    (_nav: WebViewNavigation) => {
      // Hook point for future native chrome (title, back-button enablement).
    },
    []
  );

  const retry = useCallback(() => {
    setErrored(false);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // iOS killed the WebView's content process (memory pressure while
  // backgrounded). The page is gone but the app is alive — reload once,
  // silently. A second kill within 30s means the system is thrashing;
  // surface the error screen instead of fighting it.
  const lastTerminationAtRef = useRef(0);
  const handleContentProcessTerminated = useCallback(() => {
    const now = Date.now();
    if (now - lastTerminationAtRef.current < 30_000) {
      setLoading(false);
      setErrored(true);
      return;
    }
    lastTerminationAtRef.current = now;
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  if (errored) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorTitle}>Couldn&apos;t reach Digital Garden</Text>
        <Text style={styles.errorBody}>{appOrigin}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <WebView
        key={reloadKey}
        ref={webViewRef}
        source={{ uri: url }}
        // Mark the document as native-shell before content loads, so the web
        // app hides its desktop nav on every route (not just /mobile).
        injectedJavaScriptBeforeContentLoaded={MARK_NATIVE_SHELL_JS}
        // Bridge + navigation
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleShouldStartLoad}
        onNavigationStateChange={handleNavigationStateChange}
        // Loading / error lifecycle
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setErrored(true);
        }}
        onHttpError={() => {
          // Leave soft HTTP errors (e.g. the app's own 401→/sign-in redirect)
          // to the web app; only hard load failures trip the error screen.
        }}
        onContentProcessDidTerminate={handleContentProcessTerminated}
        // Capability flags
        javaScriptEnabled
        domStorageEnabled
        // Session persistence: keep the web app's auth cookie across launches.
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        // iOS UX niceties
        allowsBackForwardNavigationGestures
        allowsInlineMediaPlayback
        // Native iOS pull-to-refresh (the WebView manages its own
        // UIRefreshControl — no ScrollView/refreshControl prop needed).
        pullToRefreshEnabled
        startInLoadingState={false}
        style={styles.webview}
      />

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
  loadingOverlay: {
    // RN 0.86 removed `absoluteFillObject`; `absoluteFill` is the spreadable form now.
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#ffffff",
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    textAlign: "center",
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#111827",
  },
  retryText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
