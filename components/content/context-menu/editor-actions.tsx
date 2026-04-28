/**
 * Editor Context Menu Actions
 *
 * Action provider for right-click in the TipTap editor.
 * Selection data is captured when the action provider runs (menu opens),
 * so it survives the menu closing and any prompt dialogs.
 *
 * Epoch 11 Sprint 45: Content Templates + Snippets
 */

import type { ContextMenuActionProvider, ContextMenuSection, ContextMenuAction } from "./types";
import type { JSONContent } from "@tiptap/core";
import { useTemplateStore } from "@/state/template-store";
import { useSnippetStore } from "@/state/snippet-store";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { instantiateTemplateContent } from "@/lib/domain/editor/template-instantiation";
import { toast } from "sonner";

/** Captured selection data — frozen when the context menu opens */
interface SelectionCapture {
  tiptapJson: { type: string; content: unknown[] };
  plainText: string;
}

/**
 * Capture the current editor selection as TipTap JSON + plain text.
 * Must be called while the selection is still active (before menu closes).
 */
function captureSelection(): SelectionCapture | null {
  const { editorsByContentId } = useEditorInstanceStore.getState();
  const editor = Object.values(editorsByContentId).find(Boolean) ?? null;
  if (!editor) return null;

  const { from, to } = editor.state.selection;
  if (from === to) return null;

  const slice = editor.state.doc.slice(from, to);
  const nodes: unknown[] = [];
  slice.content.forEach((node) => nodes.push(node.toJSON()));

  return {
    tiptapJson: { type: "doc", content: nodes },
    plainText: editor.state.doc.textBetween(from, to, "\n"),
  };
}

/**
 * Delete a category — if it has items, opens a dialog to choose where to move them.
 * Empty categories are deleted immediately with optimistic removal.
 */
async function deleteCategory(
  categoryId: string,
  scope: "content_template" | "snippet",
): Promise<boolean> {
  const tplStore = useTemplateStore.getState();
  const snipStore = useSnippetStore.getState();

  // Check if category has items
  let itemCount = 0;
  let categoryName = "";

  if (scope === "content_template") {
    const cat = tplStore.categories.find((c) => c.id === categoryId);
    categoryName = cat?.name || "Category";
    itemCount = tplStore.templates.filter((t) => t.categoryId === categoryId).length;
  } else {
    const cat = snipStore.categories.find((c) => c.id === categoryId);
    categoryName = cat?.name || "Category";
    itemCount = snipStore.snippets.filter((s) => s.categoryId === categoryId).length;
  }

  // If category has items, open the move dialog instead of deleting directly
  if (itemCount > 0) {
    window.dispatchEvent(
      new CustomEvent("delete-category-confirm", {
        detail: { categoryId, categoryName, scope, itemCount },
      }),
    );
    return false;
  }

  // Empty category — optimistic delete
  if (scope === "content_template") {
    const prevCategories = tplStore.categories;
    useTemplateStore.setState({
      categories: prevCategories.filter((c) => c.id !== categoryId),
    });

    try {
      const res = await fetch(`/api/content/reusable-categories/${categoryId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        useTemplateStore.setState({ categories: prevCategories });
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete category");
        return false;
      }

      toast.warning(`Category "${categoryName}" deleted`);
      tplStore.fetchCategories();
      return true;
    } catch {
      useTemplateStore.setState({ categories: prevCategories });
      toast.error("Failed to delete category");
      return false;
    }
  } else {
    const prevCategories = snipStore.categories;
    useSnippetStore.setState({
      categories: prevCategories.filter((c) => c.id !== categoryId),
    });

    try {
      const res = await fetch(`/api/content/reusable-categories/${categoryId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        useSnippetStore.setState({ categories: prevCategories });
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to delete category");
        return false;
      }

      toast.warning(`Category "${categoryName}" deleted`);
      snipStore.fetchCategories();
      return true;
    } catch {
      useSnippetStore.setState({ categories: prevCategories });
      toast.error("Failed to delete category");
      return false;
    }
  }
}

/**
 * Create a new category via API, returning the new category ID.
 */
async function createCategory(
  name: string,
  scope: "content_template" | "snippet",
): Promise<string | null> {
  try {
    const res = await fetch("/api/content/reusable-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), scope }),
    });

    if (!res.ok) {
      const data = await res.json();
      toast.error(data.error || "Failed to create category");
      return null;
    }

    const cat = await res.json();
    toast.success(`Category "${name.trim()}" created`);

    // Refresh store so future menus show the new category
    if (scope === "content_template") {
      useTemplateStore.getState().fetchCategories();
    } else {
      useSnippetStore.getState().fetchCategories();
    }

    return cat.id;
  } catch {
    toast.error("Failed to create category");
    return null;
  }
}

/**
 * Deduplicate a title against existing items.
 * If "My Template" exists, returns "My Template (2)".
 * If "My Template (2)" also exists, returns "My Template (3)", etc.
 */
function versionTitle(title: string, existingTitles: string[]): string {
  const trimmed = title.trim();
  if (!existingTitles.includes(trimmed)) return trimmed;

  // Strip existing version suffix to find base name
  const baseMatch = trimmed.match(/^(.+?)\s*\((\d+)\)$/);
  const baseName = baseMatch ? baseMatch[1].trim() : trimmed;

  let version = 2;
  while (existingTitles.includes(`${baseName} (${version})`)) {
    version++;
  }
  return `${baseName} (${version})`;
}

/**
 * Save captured selection as a template.
 * Title comes from the inline input in the context menu.
 * If a template with the same title already exists, auto-versions it.
 */
async function saveTemplate(capture: SelectionCapture, categoryId: string, title: string) {
  try {
    const existingTitles = useTemplateStore.getState().templates.map((t) => t.title);
    const finalTitle = versionTitle(title, existingTitles);

    const res = await fetch("/api/content/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finalTitle,
        tiptapJson: capture.tiptapJson,
        categoryId,
        searchText: finalTitle.toLowerCase(),
      }),
    });

    if (!res.ok) throw new Error("Failed to save template");
    toast.success(`Template "${finalTitle}" saved`);
    useTemplateStore.getState().fetchTemplates();
  } catch {
    toast.error("Failed to save template");
  }
}

/**
 * Save captured selection as a snippet in the given category.
 */
async function saveSnippet(capture: SelectionCapture, categoryId: string, title?: string) {
  const content = capture.plainText.trim();
  if (!content) return;

  try {
    let finalTitle = title?.trim() || null;
    if (finalTitle) {
      const existingTitles = useSnippetStore.getState().snippets.map((s) => s.displayTitle);
      finalTitle = versionTitle(finalTitle, existingTitles);
    }

    const res = await fetch("/api/content/snippets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: finalTitle,
        content,
        categoryId,
        searchText: (finalTitle || content.slice(0, 100)).toLowerCase(),
      }),
    });

    if (!res.ok) throw new Error("Failed to save snippet");
    const displayName = finalTitle || content.slice(0, 40);
    toast.success(`Snippet saved: "${displayName}${!finalTitle && content.length > 40 ? "..." : ""}"`);
    useSnippetStore.getState().fetchSnippets();
  } catch {
    toast.error("Failed to save snippet");
  }
}

/**
 * Delete a template via API.
 */
async function deleteTemplate(templateId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/content/templates/${templateId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete template");
      return false;
    }
    toast.success("Template deleted");
    useTemplateStore.getState().fetchTemplates();
    return true;
  } catch {
    toast.error("Failed to delete template");
    return false;
  }
}


/**
 * Delete a snippet via API.
 */
async function deleteSnippet(snippetId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/content/snippets/${snippetId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Failed to delete snippet");
      return false;
    }
    toast.success("Snippet deleted");
    useSnippetStore.getState().fetchSnippets();
    return true;
  } catch {
    toast.error("Failed to delete snippet");
    return false;
  }
}


/**
 * Insert a template's tiptapJson at the current cursor position.
 */
function insertTemplate(templateId: string) {
  const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
  if (!editor) return;

  const store = useTemplateStore.getState();
  const template = store.templates.find((t) => t.id === templateId)
    || store.recentTemplates.find((t) => t.id === templateId);
  if (!template) return;

  const tiptapJson = template.tiptapJson as { content?: unknown[] };
  if (tiptapJson?.content) {
    const instantiated = instantiateTemplateContent(
      {
        type: "doc",
        content: tiptapJson.content as JSONContent[],
      },
      {
        regenerateBlockIds: true,
      }
    );
    editor.chain().focus().insertContent(instantiated.content ?? []).run();
  }

  fetch(`/api/content/templates/${templateId}/use`, { method: "POST" }).catch(() => {});
  store.fetchTemplates();
}

/**
 * Insert a snippet's content at the current cursor position.
 */
function insertSnippet(snippetId: string) {
  const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
  if (!editor) return;

  const store = useSnippetStore.getState();
  const snippet = store.snippets.find((s) => s.id === snippetId);
  if (!snippet) return;

  if (snippet.tiptapJson) {
    const json = snippet.tiptapJson as { content?: unknown[] };
    if (json?.content) {
      editor.chain().focus().insertContent(json.content).run();
    }
  } else {
    editor.chain().focus().insertContent(snippet.content).run();
  }

  fetch(`/api/content/snippets/${snippetId}/use`, { method: "POST" }).catch(() => {});
  store.fetchSnippets();
}

/**
 * Insert a snippet as plain text (strips all formatting).
 */
function insertSnippetAsText(snippetId: string) {
  const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
  if (!editor) return;

  const store = useSnippetStore.getState();
  const snippet = store.snippets.find((s) => s.id === snippetId);
  if (!snippet) return;

  // Always use plain text content, ignoring any tiptapJson
  editor.chain().focus().insertContent(snippet.content).run();

  fetch(`/api/content/snippets/${snippetId}/use`, { method: "POST" }).catch(() => {});
  store.fetchSnippets();
}

/**
 * Build the category submenu for template save actions.
 *
 * Flow: user picks category (or creates one inline) → then names the template inline.
 * Two sequential inline inputs without ever leaving the context menu.
 */
function buildTemplateSaveMenu(
  categories: { id: string; name: string }[],
  capture: SelectionCapture,
): ContextMenuAction[] {
  const items: ContextMenuAction[] = [];
  const suggestedTitle = capture.plainText.slice(0, 60).trim();

  // Each existing category → click enters template name input
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    items.push({
      id: `save-tpl-${cat.id}`,
      label: cat.name,
      // First item gets the section label
      ...(i === 0 ? { sectionLabel: "Template Category" } : {}),
      inlineInput: {
        placeholder: suggestedTitle || "Template name...",
        inputLabel: "Template Name",
        onSubmit: async (title: string) => {
          await saveTemplate(capture, cat.id, title);
        },
      },
      secondaryAction: {
        icon: "x",
        onClick: async () => { await deleteCategory(cat.id, "content_template"); },
        confirmLabel: `Delete "${cat.name}"`,
      },
    });
  }

  // Separator
  if (categories.length > 0) {
    items.push({
      id: "save-tpl-divider",
      label: "",
      divider: true,
      disabled: true,
    });
  }

  // "New Category..." → inline input for category name
  // After creation, rebuilds full category list with new category's title input auto-focused
  items.push({
    id: "save-tpl-new-cat",
    label: "New Category...",
    ...(categories.length === 0 ? { sectionLabel: "Template Category" } : {}),
    inlineInput: {
      placeholder: "Category name...",
      onSubmit: async (categoryName: string): Promise<void | ContextMenuAction[]> => {
        const catId = await createCategory(categoryName, "content_template");
        if (!catId) return;

        // Rebuild the full menu with the new category included and auto-focused
        const updatedCategories = [...categories, { id: catId, name: categoryName.trim() }];
        const rebuilt: ContextMenuAction[] = [];

        for (let i = 0; i < updatedCategories.length; i++) {
          const cat = updatedCategories[i];
          const isNew = cat.id === catId;
          rebuilt.push({
            id: `save-tpl-${cat.id}`,
            label: cat.name,
            ...(i === 0 ? { sectionLabel: "Template Category" } : {}),
            inlineInput: {
              placeholder: suggestedTitle || "Template name...",
              inputLabel: "Template Name",
              autoFocus: isNew,
              onSubmit: async (title: string) => {
                await saveTemplate(capture, cat.id, title);
              },
            },
            secondaryAction: {
              icon: "x",
              onClick: async () => { await deleteCategory(cat.id, "content_template"); },
              confirmLabel: `Delete "${cat.name}"`,
            },
          });
        }

        return rebuilt;
      },
    },
  });

  return items;
}

/**
 * Build the category submenu for snippet save actions.
 *
 * Flow: user picks category (or creates one inline) → then names the snippet inline.
 * Mirrors the template save flow for consistent UX.
 */
function buildSnippetSaveMenu(
  categories: { id: string; name: string }[],
  capture: SelectionCapture,
): ContextMenuAction[] {
  const items: ContextMenuAction[] = [];
  const suggestedTitle = capture.plainText.slice(0, 60).trim();

  // Each existing category → click enters snippet name input
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    items.push({
      id: `save-snip-${cat.id}`,
      label: cat.name,
      ...(i === 0 ? { sectionLabel: "Snippet Category" } : {}),
      inlineInput: {
        placeholder: suggestedTitle || "Snippet title...",
        inputLabel: "Snippet Title",
        onSubmit: async (title: string) => {
          await saveSnippet(capture, cat.id, title);
        },
      },
      secondaryAction: {
        icon: "x",
        onClick: async () => { await deleteCategory(cat.id, "snippet"); },
        confirmLabel: `Delete "${cat.name}"`,
      },
    });
  }

  // Separator
  if (categories.length > 0) {
    items.push({
      id: "save-snip-divider",
      label: "",
      divider: true,
      disabled: true,
    });
  }

  // "New Category..." → inline input for category name
  // After creation, rebuilds full category list with new category's title input auto-focused
  items.push({
    id: "save-snip-new-cat",
    label: "New Category...",
    ...(categories.length === 0 ? { sectionLabel: "Snippet Category" } : {}),
    inlineInput: {
      placeholder: "Category name...",
      onSubmit: async (categoryName: string): Promise<void | ContextMenuAction[]> => {
        const catId = await createCategory(categoryName, "snippet");
        if (!catId) return;

        // Rebuild the full menu with the new category included and auto-focused
        const updatedCategories = [...categories, { id: catId, name: categoryName.trim() }];
        const rebuilt: ContextMenuAction[] = [];

        for (let i = 0; i < updatedCategories.length; i++) {
          const cat = updatedCategories[i];
          const isNew = cat.id === catId;
          rebuilt.push({
            id: `save-snip-${cat.id}`,
            label: cat.name,
            ...(i === 0 ? { sectionLabel: "Snippet Category" } : {}),
            inlineInput: {
              placeholder: suggestedTitle || "Snippet title...",
              inputLabel: "Snippet Title",
              autoFocus: isNew,
              onSubmit: async (title: string) => {
                await saveSnippet(capture, cat.id, title);
              },
            },
            secondaryAction: {
              icon: "x",
              onClick: async () => { await deleteCategory(cat.id, "snippet"); },
              confirmLabel: `Delete "${cat.name}"`,
            },
          });
        }

        return rebuilt;
      },
    },
  });

  return items;
}

/**
 * Editor context menu action provider.
 *
 * IMPORTANT: Selection is captured HERE (while menu is open and selection active),
 * not in the onClick handlers (which run after menu closes and selection may be lost).
 */
export const editorActionProvider: ContextMenuActionProvider = (ctx) => {
  const hasSelection = ctx.hasSelection === true;
  const sections: ContextMenuSection[] = [];

  // Capture selection NOW, before any menu interaction
  const capture = hasSelection ? captureSelection() : null;

  // --- Bubble menu shortcut: show only the relevant save submenu ---
  if (ctx.bubbleMenuAction && capture) {
    const templateStore = useTemplateStore.getState();
    const snippetStore = useSnippetStore.getState();

    if (ctx.bubbleMenuAction === "save-template") {
      return [{ actions: buildTemplateSaveMenu(templateStore.categories, capture) }];
    }
    if (ctx.bubbleMenuAction === "save-snippet") {
      return [{ actions: buildSnippetSaveMenu(snippetStore.categories, capture) }];
    }
  }

  // --- Undo / Redo ---
  const historyActions: ContextMenuAction[] = [];
  const editorRef = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;

  historyActions.push({
    id: "undo",
    label: "Undo",
    shortcut: "⌘Z",
    disabled: !editorRef?.can().undo(),
    onClick: () => { editorRef?.chain().focus().undo().run(); },
  });

  historyActions.push({
    id: "redo",
    label: "Redo",
    shortcut: "⇧⌘Z",
    disabled: !editorRef?.can().redo(),
    onClick: () => { editorRef?.chain().focus().redo().run(); },
  });

  sections.push({ actions: historyActions });

  // --- Clipboard actions ---
  const clipboardActions: ContextMenuAction[] = [];

  if (capture) {
    clipboardActions.push({
      id: "copy",
      label: "Copy",
      shortcut: "⌘C",
      onClick: async () => {
        await navigator.clipboard.writeText(capture.plainText);
      },
    });

    clipboardActions.push({
      id: "cut",
      label: "Cut",
      shortcut: "⌘X",
      onClick: async () => {
        const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
        if (!editor) return;
        await navigator.clipboard.writeText(capture.plainText);
        editor.chain().focus().deleteSelection().run();
      },
    });
  }

  clipboardActions.push({
    id: "paste",
    label: "Paste",
    shortcut: "⌘V",
    onClick: async () => {
      const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
      if (!editor) return;
      try {
        const text = await navigator.clipboard.readText();
        if (text) {
          editor.chain().focus().insertContent(text).run();
        }
      } catch {
        // Clipboard read permission denied — browser will handle native paste
      }
    },
  });

  clipboardActions.push({
    id: "select-all",
    label: "Select All",
    shortcut: "⌘A",
    onClick: () => { editorRef?.chain().focus().selectAll().run(); },
  });

  sections.push({ actions: clipboardActions });

  const templateStore = useTemplateStore.getState();
  const snippetStore = useSnippetStore.getState();

  // --- Templates submenu (single top-level item) ---
  const tplSubmenu: ContextMenuAction[] = [];

  if (capture) {
    tplSubmenu.push({
      id: "save-as-template",
      label: "Save",
      submenu: buildTemplateSaveMenu(templateStore.categories, capture),
    });
  }

  if (templateStore.templates.length > 0 || templateStore.recentTemplates.length > 0) {
    const insertSubmenu: ContextMenuAction[] = [];

    if (templateStore.recentTemplates.length > 0) {
      insertSubmenu.push({ id: "insert-tpl-recent-hdr", label: "Recent", disabled: true });
      for (const t of templateStore.recentTemplates) {
        insertSubmenu.push({
          id: `insert-tpl-${t.id}`,
          label: t.title,
          onClick: () => insertTemplate(t.id),
        });
      }
      insertSubmenu.push({ id: "insert-tpl-divider", label: "", divider: true, disabled: true });
    }

    const byCategory = new Map<string, typeof templateStore.templates>();
    for (const t of templateStore.templates) {
      const list = byCategory.get(t.categoryName) || [];
      list.push(t);
      byCategory.set(t.categoryName, list);
    }
    for (const [catName, templates] of byCategory) {
      insertSubmenu.push({
        id: `insert-tpl-cat-${catName}`,
        label: catName,
        submenu: templates.map((t) => ({
          id: `insert-tpl-${t.id}`,
          label: t.title,
          onClick: () => insertTemplate(t.id),
        })),
      });
    }

    tplSubmenu.push({ id: "insert-template", label: "Insert", submenu: insertSubmenu, searchable: true });
  }

  if (templateStore.templates.length > 0) {
    const manageSubmenu: ContextMenuAction[] = [];
    const byCategory = new Map<string, typeof templateStore.templates>();
    for (const t of templateStore.templates) {
      const list = byCategory.get(t.categoryName) || [];
      list.push(t);
      byCategory.set(t.categoryName, list);
    }
    for (const [catName, templates] of byCategory) {
      manageSubmenu.push({
        id: `manage-tpl-cat-${catName}`,
        label: catName,
        disabled: true,
        sectionLabel: manageSubmenu.length === 0 ? "Select Template" : undefined,
      });
      for (const t of templates) {
        manageSubmenu.push({
          id: `manage-tpl-${t.id}`,
          label: t.title,
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent("edit-template", { detail: { templateId: t.id } }),
            );
          },
          secondaryAction: {
            icon: "x",
            onClick: async () => { await deleteTemplate(t.id); },
            confirmLabel: `Delete "${t.title}"`,
          },
        });
      }
    }
    tplSubmenu.push({ id: "manage-templates", label: "Manage", submenu: manageSubmenu, searchable: true });
  }

  if (tplSubmenu.length > 0) {
    sections.push({
      actions: [{ id: "templates", label: "Templates", submenu: tplSubmenu }],
    });
  }

  // --- Snippets submenu (single top-level item) ---
  const snipSubmenu: ContextMenuAction[] = [];

  if (capture) {
    snipSubmenu.push({
      id: "save-as-snippet",
      label: "Save",
      submenu: buildSnippetSaveMenu(snippetStore.categories, capture),
    });
  }

  const visibleSnippets = snippetStore.snippets.filter((s) => s.isVisibleInUI);
  if (visibleSnippets.length > 0) {
    const byCategory = new Map<string, typeof visibleSnippets>();
    for (const s of visibleSnippets) {
      const list = byCategory.get(s.categoryName) || [];
      list.push(s);
      byCategory.set(s.categoryName, list);
    }

    const insertSubmenu: ContextMenuAction[] = [];
    const insertTextSubmenu: ContextMenuAction[] = [];
    for (const [catName, snippets] of byCategory) {
      insertSubmenu.push({
        id: `insert-snip-cat-${catName}`,
        label: catName,
        submenu: snippets.map((s) => ({
          id: `insert-snip-${s.id}`,
          label: s.displayTitle,
          onClick: () => insertSnippet(s.id),
        })),
      });
      insertTextSubmenu.push({
        id: `insert-snip-text-cat-${catName}`,
        label: catName,
        submenu: snippets.map((s) => ({
          id: `insert-snip-text-${s.id}`,
          label: s.displayTitle,
          onClick: () => insertSnippetAsText(s.id),
        })),
      });
    }

    snipSubmenu.push({ id: "insert-snippet", label: "Insert", submenu: insertSubmenu, searchable: true });
    snipSubmenu.push({ id: "insert-snippet-text", label: "Insert as Text", submenu: insertTextSubmenu, searchable: true });
  }

  if (snippetStore.snippets.length > 0) {
    const manageSubmenu: ContextMenuAction[] = [];
    const byCategory = new Map<string, typeof snippetStore.snippets>();
    for (const s of snippetStore.snippets) {
      const list = byCategory.get(s.categoryName) || [];
      list.push(s);
      byCategory.set(s.categoryName, list);
    }
    for (const [catName, snippets] of byCategory) {
      manageSubmenu.push({
        id: `manage-snip-cat-${catName}`,
        label: catName,
        disabled: true,
        sectionLabel: manageSubmenu.length === 0 ? "Select Snippet" : undefined,
      });
      for (const s of snippets) {
        manageSubmenu.push({
          id: `manage-snip-${s.id}`,
          label: s.displayTitle,
          onClick: () => {
            window.dispatchEvent(
              new CustomEvent("edit-snippet", { detail: { snippetId: s.id } }),
            );
          },
          secondaryAction: {
            icon: "x",
            onClick: async () => { await deleteSnippet(s.id); },
            confirmLabel: `Delete "${s.displayTitle}"`,
          },
        });
      }
    }
    snipSubmenu.push({ id: "manage-snippets", label: "Manage", submenu: manageSubmenu, searchable: true });
  }

  if (snipSubmenu.length > 0) {
    sections.push({
      actions: [{ id: "snippets", label: "Snippets", submenu: snipSubmenu }],
    });
  }

  // --- Dev tools (local development only) ---
  if (process.env.NODE_ENV === "development") {
    const devActions: ContextMenuAction[] = [];

    devActions.push({
      id: "inspect-element",
      label: "Inspect Element",
      shortcut: "⌥+Click",
      onClick: () => {
        const target = ctx.contextTarget as Element | undefined;
        const x = (ctx.contextX as number) ?? 0;
        const y = (ctx.contextY as number) ?? 0;
        if (target) {
          // Set pass-through flag so the MarkdownEditor handler yields to browser
          (window as any).__passNativeContextMenu = true;
          const nativeEvent = new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: x,
            clientY: y,
            button: 2,
          });
          setTimeout(() => target.dispatchEvent(nativeEvent), 50);
        }
      },
    });

    sections.push({ actions: devActions });
  }

  return sections;
};
