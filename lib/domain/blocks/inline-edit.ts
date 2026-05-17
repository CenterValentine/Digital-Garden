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
