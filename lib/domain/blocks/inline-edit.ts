/**
 * Inline-editable field helpers for atom block NodeViews.
 *
 * Pattern: create fields with makeEditableField(), store refs in a module-level
 * WeakMap keyed on contentDom, then call syncEditableField() in updateContent()
 * to update text without clobbering active cursor position.
 */

export function makeEditableField(
  tag: string,
  className: string,
  value: string,
  attrKey: string,
  placeholder?: string,
): HTMLElement {
  const el = document.createElement(tag);
  el.className = className;
  el.contentEditable = "true";
  if (value) el.textContent = value;
  if (placeholder) el.dataset.placeholder = placeholder;

  const stopAll = (e: Event) => e.stopPropagation();
  el.addEventListener("mousedown", stopAll);
  el.addEventListener("click", stopAll);
  el.addEventListener("beforeinput", stopAll);
  el.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); return; }
    e.stopPropagation();
  });
  el.addEventListener("input", () => {
    // Walk up to the block-node wrapper to get the live blockId
    const blockNode = el.closest("[data-block-id]");
    const blockId = blockNode?.getAttribute("data-block-id") ?? "";
    window.dispatchEvent(
      new CustomEvent("block-attrs-change", {
        detail: { blockId, key: attrKey, value: el.textContent?.trim() ?? "" },
      }),
    );
  });

  return el;
}

export function syncEditableField(el: HTMLElement, value: string): void {
  // Never overwrite text while the user is actively typing in this field
  if (document.activeElement !== el) {
    el.textContent = value || "";
  }
}

/**
 * True when `a` and `b` agree on every attr EXCEPT `field` — the guard a
 * NodeView's updateContent uses to sync an inline-editable field in place
 * instead of tearing down the DOM (which destroys the focused element and
 * ate the caret between keystrokes in the mermaid/excalidraw headers).
 */
export function onlyFieldChanged(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  field: string,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete(field);
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

/**
 * Commit an inline block title to the ACTUAL ContentNode on blur/Enter.
 *
 * The per-keystroke `block-attrs-change` events only write the TipTap node
 * attr — before this helper, the linked file's real title was set once at
 * creation and silently desynced from the header forever after. Committing
 * on focusout (never per keystroke — each PATCH regenerates the slug)
 * makes the header rename the file, and `content-updated` is what the
 * sidebar tree and tab strip listen for to patch titles in place.
 */
export function attachTitleRenameOnBlur(
  el: HTMLElement,
  getContentId: () => string | null,
): void {
  el.addEventListener("focusin", () => {
    el.dataset.renameBaseline = el.textContent ?? "";
  });
  el.addEventListener("focusout", () => {
    const baseline = (el.dataset.renameBaseline ?? "").trim();
    delete el.dataset.renameBaseline;
    const title = (el.textContent ?? "").trim();
    const contentId = getContentId();
    if (!contentId || !title || title === baseline) return;
    void fetch(`/api/content/content/${encodeURIComponent(contentId)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
      .then(async (res) => {
        const result = (await res.json().catch(() => null)) as {
          success?: boolean;
        } | null;
        // The API can return 200 with success:false — check both.
        if (!res.ok || !result?.success) return;
        window.dispatchEvent(
          new CustomEvent("content-updated", {
            detail: { contentId, updates: { title } },
          }),
        );
      })
      .catch(() => {
        // best-effort — the node attr already holds the new label
      });
  });
}
