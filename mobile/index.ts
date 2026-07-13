import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent calls AppRegistry.registerComponent("main", () => App)
// and sets up the Expo environment appropriately for both Expo Go and native
// builds. This is the canonical Expo entry point (see package.json "main").
registerRootComponent(App);
