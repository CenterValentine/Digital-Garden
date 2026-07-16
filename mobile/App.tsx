import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { MobileWebView } from "./src/MobileWebView";

/**
 * App root. Deliberately thin: provide safe-area context + status bar, then
 * hand the whole screen to the WebView. All product UI lives in the web app.
 */
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <MobileWebView />
    </SafeAreaProvider>
  );
}
