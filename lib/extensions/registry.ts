import { BUILT_IN_EXTENSIONS } from "./installed";
import type {
  BuiltInExtension,
  ExtensionManifest,
  ExtensionNavItem,
  ExtensionRuntime,
  ExtensionServerRuntime,
  ExtensionSettingsEntry,
} from "./types";

export function getAllBuiltInExtensions(): BuiltInExtension[] {
  return BUILT_IN_EXTENSIONS;
}

export function getEnabledBuiltInExtensions(): BuiltInExtension[] {
  return getAllBuiltInExtensions().filter(
    (extension) => extension.manifest.enabledByDefault
  );
}

export function getAllExtensionManifests(): ExtensionManifest[] {
  return getAllBuiltInExtensions().map((extension) => extension.manifest);
}

export function getEnabledExtensionManifests(): ExtensionManifest[] {
  return getEnabledBuiltInExtensions().map((extension) => extension.manifest);
}

export function getEnabledExtensionRuntimes(): ExtensionRuntime[] {
  return getEnabledBuiltInExtensions()
    .map((extension) => extension.runtime)
    .filter((runtime): runtime is ExtensionRuntime => Boolean(runtime));
}

export function getAllExtensionRuntimes(): ExtensionRuntime[] {
  return getAllBuiltInExtensions()
    .map((extension) => extension.runtime)
    .filter((runtime): runtime is ExtensionRuntime => Boolean(runtime));
}

export function getEnabledExtensionServerRuntimes(): ExtensionServerRuntime[] {
  return getEnabledBuiltInExtensions()
    .map((extension) => extension.serverRuntime)
    .filter(
      (runtime): runtime is ExtensionServerRuntime => Boolean(runtime)
    );
}

export function getExtensionNavItems(): ExtensionNavItem[] {
  return getEnabledExtensionManifests()
    .flatMap((extension) => extension.navItems)
    .sort((a, b) => a.order - b.order);
}

export function getExtensionManifestForView(
  view: string
): ExtensionManifest | undefined {
  return getEnabledExtensionManifests().find((extension) =>
    extension.navItems.some((item) => item.view === view)
  );
}

export function getExtensionManifestById(
  extensionId: string
): ExtensionManifest | undefined {
  return getAllExtensionManifests().find(
    (extension) => extension.id === extensionId
  );
}

export function getExtensionRuntimeForView(
  view: string
): ExtensionRuntime | undefined {
  const manifest = getExtensionManifestForView(view);
  if (!manifest) return undefined;
  return getEnabledExtensionRuntimes().find(
    (runtime) => runtime.id === manifest.id
  );
}

export function getExtensionSettingsEntries(): Array<
  ExtensionSettingsEntry & { extensionId: string; iconName: string }
> {
  return getEnabledExtensionManifests()
    .filter(
      (
        extension
      ): extension is ExtensionManifest & {
        settings: ExtensionSettingsEntry;
      } => Boolean(extension.settings)
    )
    .map((extension) => ({
      ...extension.settings,
      extensionId: extension.id,
      iconName: extension.iconName,
    }))
    .sort((a, b) => a.order - b.order);
}

export function getGoogleOAuthScopesForRequest(input: {
  redirectPath: string;
  requestedScopes: string[];
}): string[] {
  const requestedScopeSet = new Set(
    input.requestedScopes.map((scope) => scope.trim().toLowerCase())
  );
  const scopes = new Set<string>();

  for (const extension of getEnabledExtensionManifests()) {
    const googleAuth = extension.auth?.google;
    if (!googleAuth) continue;

    const matchesRedirect = (googleAuth.redirectPrefixes ?? []).some((prefix) =>
      input.redirectPath.startsWith(prefix)
    );
    const matchesRequestedToken = (googleAuth.scopeTokens ?? []).some((token) =>
      requestedScopeSet.has(token.toLowerCase())
    );

    if (!matchesRedirect && !matchesRequestedToken) continue;

    for (const scope of googleAuth.scopes) {
      scopes.add(scope);
    }
  }

  return Array.from(scopes);
}

export function isExtensionView(view: string): boolean {
  return Boolean(getExtensionManifestForView(view));
}
