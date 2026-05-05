const APP_SOURCE = "dg-browser-bookmarks-app";
const EXTENSION_SOURCE = "dg-browser-bookmarks-extension";
const PRESENCE_NODE_ID = "dg-browser-bookmarks-extension-presence";

function detectBrowser() {
  const ua = navigator.userAgent;
  if (ua.includes("Vivaldi")) {
    const match = ua.match(/Vivaldi\/([\d.]+)/);
    return { name: "Vivaldi", version: match?.[1] || null };
  }
  if (ua.includes("Edg/")) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { name: "Microsoft Edge", version: match?.[1] || null };
  }
  if (ua.includes("Chrome/")) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { name: "Chrome", version: match?.[1] || null };
  }
  if (ua.includes("Chromium/")) {
    const match = ua.match(/Chromium\/([\d.]+)/);
    return { name: "Chromium", version: match?.[1] || null };
  }
  return { name: "Unknown Chromium Browser", version: null };
}

function detectOs() {
  const ua = navigator.userAgent;
  if (ua.includes("Mac OS X")) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return { name: "macOS", version: match?.[1]?.replaceAll("_", ".") || null };
  }
  if (ua.includes("Windows NT")) {
    const match = ua.match(/Windows NT ([\d.]+)/);
    return { name: "Windows", version: match?.[1] || null };
  }
  if (ua.includes("Linux")) {
    return { name: "Linux", version: null };
  }
  return { name: "Unknown OS", version: null };
}

function toFolderTree(node) {
  if (node.url) return null;
  return {
    id: node.id,
    title: node.title || "(untitled)",
    children: (node.children || [])
      .map((child) => toFolderTree(child))
      .filter(Boolean),
  };
}

async function buildExtensionInfo() {
  const extensionContext = await sendRuntimeMessage({ type: "get-extension-context" });
  const manifest = chrome.runtime.getManifest();
  return {
    installed: true,
    extensionId: chrome.runtime.id,
    extensionName: manifest.name,
    extensionVersion: manifest.version,
    installInstanceId: extensionContext.installInstanceId,
    trustedInstallId: extensionContext.trustedInstallId,
    trustedAt: extensionContext.trustedAt,
    tokenPresent: extensionContext.tokenPresent,
    appBaseUrl: extensionContext.appBaseUrl,
    browser: detectBrowser(),
    os: detectOs(),
  };
}

async function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Unknown error"));
        return;
      }
      resolve(response.data);
    });
  });
}

function ensurePresenceNode(info) {
  let node = document.getElementById(PRESENCE_NODE_ID);
  if (!node) {
    node = document.createElement("meta");
    node.id = PRESENCE_NODE_ID;
    document.documentElement.appendChild(node);
  }
  node.setAttribute("data-installed", "true");
  node.setAttribute("data-extension-id", info.extensionId);
  node.setAttribute("data-extension-name", info.extensionName);
  node.setAttribute("data-extension-version", info.extensionVersion);
  node.setAttribute("data-install-instance-id", info.installInstanceId || "");
  node.setAttribute("data-trusted-install-id", info.trustedInstallId || "");
  node.setAttribute("data-trusted-at", info.trustedAt || "");
  node.setAttribute("data-token-present", info.tokenPresent ? "true" : "false");
  node.setAttribute("data-app-base-url", info.appBaseUrl || "");
  node.setAttribute("data-browser-name", info.browser.name);
  node.setAttribute("data-browser-version", info.browser.version || "");
  node.setAttribute("data-os-name", info.os.name);
  node.setAttribute("data-os-version", info.os.version || "");
}

async function postMessageToPage(type, payload) {
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type,
      payload,
    },
    window.location.origin
  );
}

async function dispatchResponseEvent(type, payload) {
  document.dispatchEvent(
    new CustomEvent("dg-browser-bookmarks-response", {
      detail: {
        source: EXTENSION_SOURCE,
        type,
        payload,
      },
    })
  );
}

async function respondWithInstalledInfo() {
  const info = await buildExtensionInfo();
  ensurePresenceNode(info);
  await postMessageToPage("pong", info);
  await dispatchResponseEvent("pong", info);
}

async function respondWithFolderTree() {
  const root = await sendRuntimeMessage({ type: "fetch-bookmark-tree" });
  const folders = (root?.children || [])
    .map((child) => toFolderTree(child))
    .filter(Boolean);
  const payload = {
    ...(await buildExtensionInfo()),
    folders,
  };
  ensurePresenceNode(payload);
  await postMessageToPage("bookmark-folder-tree", payload);
  await dispatchResponseEvent("bookmark-folder-tree", payload);
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== APP_SOURCE) return;

  try {
    if (event.data.type === "ping") {
      await respondWithInstalledInfo();
      return;
    }

    if (event.data.type === "get-bookmark-folder-tree") {
      await respondWithFolderTree();
      return;
    }

    if (event.data.type === "save-trusted-install") {
      const context = await sendRuntimeMessage({
        type: "save-trusted-install",
        payload: event.data.payload,
      });
      const payload = {
        ...(await buildExtensionInfo()),
        trustedInstallId: context.trustedInstallId,
        trustedAt: context.trustedAt,
        tokenPresent: context.tokenPresent,
        appBaseUrl: context.appBaseUrl,
      };
      ensurePresenceNode(payload);
      await postMessageToPage("trusted-install-saved", payload);
      await dispatchResponseEvent("trusted-install-saved", payload);
      return;
    }

    if (event.data.type === "clear-trusted-install") {
      const context = await sendRuntimeMessage({
        type: "clear-trusted-install",
      });
      const payload = {
        ...(await buildExtensionInfo()),
        trustedInstallId: context.trustedInstallId,
        trustedAt: context.trustedAt,
        tokenPresent: context.tokenPresent,
        appBaseUrl: context.appBaseUrl,
      };
      ensurePresenceNode(payload);
      await postMessageToPage("trusted-install-cleared", payload);
      await dispatchResponseEvent("trusted-install-cleared", payload);
    }
  } catch (error) {
    await postMessageToPage("bridge-error", {
      message: error?.message || "Bridge request failed",
    });
    await dispatchResponseEvent("bridge-error", {
      message: error?.message || "Bridge request failed",
    });
  }
});

document.addEventListener("dg-browser-bookmarks-request", async (event) => {
  try {
    const detail = event.detail || {};
    if (detail.type === "ping") {
      await respondWithInstalledInfo();
      return;
    }
    if (detail.type === "get-bookmark-folder-tree") {
      await respondWithFolderTree();
      return;
    }
    if (detail.type === "save-trusted-install") {
      const context = await sendRuntimeMessage({
        type: "save-trusted-install",
        payload: detail.payload,
      });
      const payload = {
        ...(await buildExtensionInfo()),
        trustedInstallId: context.trustedInstallId,
        trustedAt: context.trustedAt,
        tokenPresent: context.tokenPresent,
        appBaseUrl: context.appBaseUrl,
      };
      ensurePresenceNode(payload);
      await postMessageToPage("trusted-install-saved", payload);
      await dispatchResponseEvent("trusted-install-saved", payload);
      return;
    }
    if (detail.type === "clear-trusted-install") {
      const context = await sendRuntimeMessage({
        type: "clear-trusted-install",
      });
      const payload = {
        ...(await buildExtensionInfo()),
        trustedInstallId: context.trustedInstallId,
        trustedAt: context.trustedAt,
        tokenPresent: context.tokenPresent,
        appBaseUrl: context.appBaseUrl,
      };
      ensurePresenceNode(payload);
      await postMessageToPage("trusted-install-cleared", payload);
      await dispatchResponseEvent("trusted-install-cleared", payload);
    }
  } catch (error) {
    await postMessageToPage("bridge-error", {
      message: error?.message || "Bridge request failed",
    });
    await dispatchResponseEvent("bridge-error", {
      message: error?.message || "Bridge request failed",
    });
  }
});

(async () => {
  const initialInfo = await buildExtensionInfo();
  ensurePresenceNode(initialInfo);
  window.postMessage(
    {
      source: EXTENSION_SOURCE,
      type: "installed",
      payload: initialInfo,
    },
    window.location.origin
  );
  document.dispatchEvent(
    new CustomEvent("dg-browser-bookmarks-response", {
      detail: {
        source: EXTENSION_SOURCE,
        type: "installed",
        payload: initialInfo,
      },
    })
  );
})().catch(() => {
  // Presence will be retried through ping/bridge requests.
});
