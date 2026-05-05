export const DEFAULT_BOOKMARK_PREFERENCES = {
  resourceTypes: [
    "article",
    "video",
    "song",
    "course",
    "lesson",
    "documentation",
    "repository",
    "package",
    "issue",
    "discussion",
    "social_post",
    "product",
    "service",
    "tool",
    "dataset",
    "paper",
    "book",
    "map_location",
    "profile",
    "organization",
    "unknown",
  ],
  resourceRelationships: [
    "cites",
    "supports",
    "contradicts",
    "explains",
    "teaches",
    "demonstrates",
    "implements",
    "depends_on",
    "uses",
    "compares",
    "evaluates",
    "archives",
    "inspired_by",
    "mentions",
    "related_to",
  ],
  userIntents: [
    "learn",
    "research",
    "build",
    "cite",
    "decide",
    "compare",
    "buy",
    "monitor",
    "archive",
    "share",
    "teach",
  ],
};

const activeControllers = new Set();

function normalizeList(values, fallback) {
  if (!Array.isArray(values)) return [...fallback];
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeBookmarkPreferences(payload = {}) {
  return {
    resourceTypes: normalizeList(
      payload.resourceTypes,
      DEFAULT_BOOKMARK_PREFERENCES.resourceTypes
    ),
    resourceRelationships: normalizeList(
      payload.resourceRelationships,
      DEFAULT_BOOKMARK_PREFERENCES.resourceRelationships
    ),
    userIntents: normalizeList(
      payload.userIntents,
      DEFAULT_BOOKMARK_PREFERENCES.userIntents
    ),
  };
}

export function mountTaxonomyControl({
  container,
  label,
  values,
  placeholder,
  selectedValue = "",
  onSave,
  onChange,
}) {
  let state = normalizeList(values, []);
  let value = state.includes(selectedValue) ? selectedValue : "";
  let menuOpen = false;
  let editingIndex = -1;

  function closeMenu() {
    menuOpen = false;
    editingIndex = -1;
    render();
  }

  function closeOtherMenus() {
    for (const controller of activeControllers) {
      if (controller !== api) {
        controller.close();
      }
    }
  }

  function renderValueText(currentValue) {
    return currentValue ? escapeHtml(currentValue) : escapeHtml(placeholder);
  }

  function renderOptionRow(option, index) {
    const isSelected = option === value;
    const isEditing = editingIndex === index;

    if (isEditing) {
      return `
        <div class="taxonomy-menu-row taxonomy-menu-row-editing">
          <input
            class="taxonomy-inline-input"
            data-edit-input="${index}"
            value="${escapeHtml(option)}"
          />
          <div class="taxonomy-row-actions">
            <button class="taxonomy-icon-button" type="button" data-save-edit="${index}" aria-label="Save ${escapeHtml(option)}">✓</button>
            <button class="taxonomy-icon-button secondary-button" type="button" data-cancel-edit="${index}" aria-label="Cancel editing ${escapeHtml(option)}">×</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="taxonomy-menu-row ${isSelected ? "taxonomy-menu-row-selected" : ""}">
        <button
          class="taxonomy-option-button"
          type="button"
          data-select-value="${escapeHtml(option)}"
          aria-pressed="${isSelected ? "true" : "false"}"
        >
          <span class="taxonomy-option-text">${escapeHtml(option)}</span>
          <span class="taxonomy-option-check">${isSelected ? "✓" : ""}</span>
        </button>
        <div class="taxonomy-row-actions">
          <button class="taxonomy-icon-button secondary-button" type="button" data-edit-item="${index}" aria-label="Edit ${escapeHtml(option)}">✎</button>
          <button class="taxonomy-icon-button danger-button" type="button" data-delete-item="${index}" aria-label="Delete ${escapeHtml(option)}">🗑</button>
        </div>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <div class="taxonomy-control">
        <div class="taxonomy-control-label">${escapeHtml(label)}</div>
        <button
          class="taxonomy-trigger ${value ? "" : "taxonomy-trigger-placeholder"}"
          type="button"
          data-taxonomy-trigger
          aria-expanded="${menuOpen ? "true" : "false"}"
        >
          <span class="taxonomy-trigger-text">${renderValueText(value)}</span>
          <span class="taxonomy-trigger-chevron">${menuOpen ? "▴" : "▾"}</span>
        </button>
        <div class="taxonomy-menu ${menuOpen ? "taxonomy-menu-open" : ""}" ${menuOpen ? "" : "hidden"}>
          <div class="taxonomy-menu-header">
            <div class="taxonomy-menu-title">${escapeHtml(label)}</div>
            ${
              value
                ? `<button class="taxonomy-clear-button secondary-button" type="button" data-clear-value>Clear</button>`
                : ""
            }
          </div>
          <div class="taxonomy-menu-list">
            ${state.map((option, index) => renderOptionRow(option, index)).join("")}
          </div>
          <div class="taxonomy-menu-add">
            <input class="taxonomy-inline-input" data-add-input placeholder="Add a new value" />
            <button class="taxonomy-icon-button" type="button" data-add-item aria-label="Add value">+</button>
          </div>
        </div>
      </div>
    `;
  }

  async function persist(nextValues, nextValue = value) {
    const normalizedValues = normalizeList(nextValues, []);
    const savedValues = normalizeList(await onSave(normalizedValues), normalizedValues);
    state = savedValues;
    value = state.includes(nextValue) ? nextValue : "";
    editingIndex = -1;
    render();
    onChange?.(value);
  }

  container.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-taxonomy-trigger]");
    if (trigger) {
      if (!menuOpen) {
        closeOtherMenus();
      }
      menuOpen = !menuOpen;
      editingIndex = -1;
      render();
      return;
    }

    const selectButton = event.target.closest("[data-select-value]");
    if (selectButton) {
      value = selectButton.getAttribute("data-select-value") || "";
      closeMenu();
      onChange?.(value);
      return;
    }

    const clearButton = event.target.closest("[data-clear-value]");
    if (clearButton) {
      value = "";
      closeMenu();
      onChange?.(value);
      return;
    }

    const editButton = event.target.closest("[data-edit-item]");
    if (editButton) {
      editingIndex = Number(editButton.getAttribute("data-edit-item"));
      render();
      const input = container.querySelector(`[data-edit-input="${editingIndex}"]`);
      input?.focus();
      input?.select();
      return;
    }

    const cancelButton = event.target.closest("[data-cancel-edit]");
    if (cancelButton) {
      editingIndex = -1;
      render();
      return;
    }

    const saveButton = event.target.closest("[data-save-edit]");
    if (saveButton) {
      const index = Number(saveButton.getAttribute("data-save-edit"));
      const input = container.querySelector(`[data-edit-input="${index}"]`);
      const nextText = input?.value?.trim() || "";
      if (!nextText) return;
      const nextValues = [...state];
      nextValues[index] = nextText;
      const nextSelectedValue = value === state[index] ? nextText : value;
      await persist(nextValues, nextSelectedValue);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-item]");
    if (deleteButton) {
      const index = Number(deleteButton.getAttribute("data-delete-item"));
      const deletedValue = state[index];
      await persist(
        state.filter((_, currentIndex) => currentIndex !== index),
        value === deletedValue ? "" : value
      );
      return;
    }

    const addButton = event.target.closest("[data-add-item]");
    if (addButton) {
      const input = container.querySelector("[data-add-input]");
      const nextText = input?.value?.trim() || "";
      if (!nextText) return;
      if (input) input.value = "";
      await persist([...state, nextText], value);
    }
  });

  container.addEventListener("keydown", async (event) => {
    const addInput = event.target.closest("[data-add-input]");
    if (addInput && event.key === "Enter") {
      event.preventDefault();
      const nextText = addInput.value.trim();
      if (!nextText) return;
      addInput.value = "";
      await persist([...state, nextText], value);
      return;
    }

    const editInput = event.target.closest("[data-edit-input]");
    if (editInput && event.key === "Enter") {
      event.preventDefault();
      const index = Number(editInput.getAttribute("data-edit-input"));
      const nextText = editInput.value.trim();
      if (!nextText) return;
      const nextValues = [...state];
      nextValues[index] = nextText;
      const nextSelectedValue = value === state[index] ? nextText : value;
      await persist(nextValues, nextSelectedValue);
      return;
    }

    if (event.key === "Escape" && menuOpen) {
      event.preventDefault();
      closeMenu();
    }
  });

  const handlePointerDown = (event) => {
    if (!container.contains(event.target)) {
      closeMenu();
    }
  };

  document.addEventListener("pointerdown", handlePointerDown);

  render();

  const api = {
    close: closeMenu,
    getValue() {
      return value;
    },
    setValue(nextValue) {
      value = state.includes(nextValue) ? nextValue : "";
      render();
    },
    setValues(nextValues) {
      state = normalizeList(nextValues, []);
      value = state.includes(value) ? value : "";
      editingIndex = -1;
      render();
    },
    destroy() {
      document.removeEventListener("pointerdown", handlePointerDown);
      activeControllers.delete(api);
    },
  };

  activeControllers.add(api);

  return api;
}
