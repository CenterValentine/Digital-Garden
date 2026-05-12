async function sendMessage(message) {
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

let bookmarkTreeRoot = null;
const expandedFolderIds = new Set();

async function loadState() {
  const [config, extensionContext, connections] = await Promise.all([
    sendMessage({ type: "get-config" }),
    sendMessage({ type: "get-extension-context" }),
    sendMessage({ type: "fetch-connections" }).catch(() => []),
  ]);

  document.getElementById("trust-status-line").textContent = extensionContext.trustedInstallId
    ? "Trusted"
    : "Not trusted yet";
  document.getElementById("trust-status-hint").textContent = extensionContext.trustedInstallId
    ? "This browser install already has a hidden sync token managed by Digital Garden."
    : "Open Digital Garden > Settings > Browser Bookmarks and choose Trust This Browser Extension.";
  document.getElementById("connected-app-line").textContent =
    extensionContext.appBaseUrl || "Not connected yet";
  document.getElementById("connected-install-line").textContent = extensionContext.installInstanceId
    ? `Install ID ${extensionContext.installInstanceId}`
    : "No install identifier is available yet.";
  document.getElementById("native-save-behavior").value =
    config.nativeSaveBehavior || "silent-defaults";
  document.getElementById("default-dedupe-enabled").value = String(
    Boolean(config.defaults?.dedupeEnabled)
  );
  document.getElementById("default-preserve-html").value = String(
    Boolean(config.defaults?.preserveHtml)
  );
  document.getElementById("rules-json").value = JSON.stringify(
    config.rules || [],
    null,
    2
  );

  const select = document.getElementById("default-connection");
  if (connections.length === 0) {
    select.innerHTML = '<option value="">No synced connections yet</option>';
  } else {
    select.innerHTML = [
      '<option value="">Choose a default connection</option>',
      ...connections.map(
        (connection) =>
          `<option value="${connection.id}">${connection.name} (${connection.chromeRootTitle})</option>`
      ),
    ].join("");
  }
  if (config.defaultConnectionId) {
    select.value = config.defaultConnectionId;
  }

  await loadBookmarkTree();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function flattenVisibleNodes(nodes, depth = 0, parentId = null, rows = []) {
  for (const node of nodes || []) {
    const isFolder = !node.url;
    rows.push({
      id: node.id,
      title: node.title || "(untitled)",
      url: node.url || "",
      parentId,
      depth,
      isFolder,
      childCount: node.children?.length || 0,
    });
    if (isFolder && expandedFolderIds.has(node.id) && node.children?.length) {
      flattenVisibleNodes(node.children, depth + 1, node.id, rows);
    }
  }
  return rows;
}

function renderBookmarkTree() {
  const container = document.getElementById("bookmark-tree");
  if (!bookmarkTreeRoot) {
    container.innerHTML = "";
    return;
  }

  const rows = flattenVisibleNodes(bookmarkTreeRoot.children || []);
  container.innerHTML =
    `
      <div class="tree-header">
        <div class="tree-header-name">Bookmark Folder / Bookmark</div>
        <div class="tree-header-id">Bookmark ID</div>
      </div>
    ` +
    rows
    .map((row) => {
      const title = escapeHtml(row.title);
      const id = escapeHtml(row.id);
      const parentId = row.parentId ? escapeHtml(row.parentId) : "";
      const indent = row.depth * 18;
      const expanded = row.isFolder && expandedFolderIds.has(row.id);
      const disclosure = row.isFolder
        ? `<button class="tree-toggle" type="button" data-toggle-folder="${id}" aria-label="${expanded ? "Collapse" : "Expand"} folder">${expanded ? "▾" : "▸"}</button>`
        : `<span class="tree-spacer"></span>`;
      const kindGlyph = row.isFolder ? "📁" : "🔖";
      const secondary = row.isFolder
        ? `Folder ID: <code>${id}</code> • ${row.childCount} item${row.childCount === 1 ? "" : "s"}`
        : `Bookmark ID: <code>${id}</code>${parentId ? ` • Folder ID: <code>${parentId}</code>` : ""}`;
      const tertiary = row.url ? `<div class="tree-node-url">${escapeHtml(row.url)}</div>` : "";
      const actions = row.isFolder
        ? `<button class="tiny-button" type="button" data-copy-folder-id="${id}">Copy Folder ID</button>`
        : `<button class="tiny-button" type="button" data-copy-bookmark-id="${id}">Copy Bookmark ID</button>`;

      return `
        <div class="tree-row" style="--tree-depth:${indent}px">
          <div class="tree-row-main">
            ${disclosure}
            <span class="tree-kind">${kindGlyph}</span>
            <div class="tree-node-content">
              <div class="tree-node-title">${title}</div>
              <div class="tree-node-meta">${secondary}</div>
              ${tertiary}
            </div>
          </div>
          <div class="tree-row-actions">
            ${actions}
          </div>
        </div>
      `;
    })
    .join("");
}

async function loadBookmarkTree() {
  const status = document.getElementById("bookmark-tree-status");
  const container = document.getElementById("bookmark-tree");
  status.textContent = "Loading browser bookmarks...";
  container.innerHTML = "";

  try {
    const [root] = await chrome.bookmarks.getTree();
    bookmarkTreeRoot = root || null;
    renderBookmarkTree();
    const nodes = bookmarkTreeRoot?.children || [];
    status.textContent =
      nodes.length > 0
        ? "Use a folder ID from this inspector as the Browser Root ID in Digital Garden."
        : "No bookmark folders were returned by the browser.";
  } catch (error) {
    console.error("[DG Bookmarks Options] Failed to load bookmark tree", error);
    status.textContent = error.message || "Failed to load browser bookmark tree.";
  }
}

async function saveConfig() {
  const current = await sendMessage({ type: "get-config" });
  const next = {
    ...current,
    nativeSaveBehavior: document.getElementById("native-save-behavior").value,
    defaultConnectionId: document.getElementById("default-connection").value,
    defaults: {
      ...(current.defaults || {}),
      dedupeEnabled:
        document.getElementById("default-dedupe-enabled").value === "true",
      preserveHtml:
        document.getElementById("default-preserve-html").value === "true",
    },
  };
  await sendMessage({ type: "save-config", payload: next });
}

document.getElementById("save-config").addEventListener("click", async () => {
  await saveConfig();
});

document.getElementById("save-rules").addEventListener("click", async () => {
  const current = await sendMessage({ type: "get-config" });
  const rules = JSON.parse(document.getElementById("rules-json").value || "[]");
  await sendMessage({
    type: "save-config",
    payload: { ...current, rules },
  });
});

document.getElementById("export-rules").addEventListener("click", async () => {
  const exported = await sendMessage({ type: "export-rules" });
  const blob = new Blob([JSON.stringify(exported, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "digital-garden-bookmark-rules.json";
  link.click();
  URL.revokeObjectURL(url);
});

document.getElementById("import-rules").addEventListener("click", () => {
  document.getElementById("rules-file").click();
});

document.getElementById("rules-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const parsed = JSON.parse(await file.text());
  await sendMessage({ type: "import-rules", payload: parsed });
  await loadState();
});

document.getElementById("bootstrap-default").addEventListener("click", async () => {
  const config = await sendMessage({ type: "get-config" });
  if (!config.defaultConnectionId) return;
  await sendMessage({
    type: "bootstrap-connection",
    connectionId: config.defaultConnectionId,
  });
});

document.getElementById("refresh-bookmark-tree").addEventListener("click", async () => {
  await loadBookmarkTree();
});

document.getElementById("bookmark-tree").addEventListener("click", async (event) => {
  const toggle = event.target.closest("[data-toggle-folder]");
  if (toggle) {
    const folderId = toggle.getAttribute("data-toggle-folder");
    if (!folderId) return;
    if (expandedFolderIds.has(folderId)) {
      expandedFolderIds.delete(folderId);
    } else {
      expandedFolderIds.add(folderId);
    }
    renderBookmarkTree();
    return;
  }

  const folderButton = event.target.closest("[data-copy-folder-id]");
  if (folderButton) {
    const folderId = folderButton.getAttribute("data-copy-folder-id");
    if (!folderId) return;
    await navigator.clipboard.writeText(folderId);
    document.getElementById("bookmark-tree-status").textContent =
      `Copied folder ID ${folderId} to the clipboard.`;
    return;
  }

  const bookmarkButton = event.target.closest("[data-copy-bookmark-id]");
  if (bookmarkButton) {
    const bookmarkId = bookmarkButton.getAttribute("data-copy-bookmark-id");
    if (!bookmarkId) return;
    await navigator.clipboard.writeText(bookmarkId);
    document.getElementById("bookmark-tree-status").textContent =
      `Copied bookmark ID ${bookmarkId} to the clipboard.`;
  }
});

loadState().catch((error) => {
  console.error("[DG Bookmarks Options] Failed to load", error);
});
