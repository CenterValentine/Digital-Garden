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
import type { Editor, JSONContent } from "@tiptap/core";
import { useTemplateStore } from "@/state/template-store";
import { useSnippetStore } from "@/state/snippet-store";
import { useEditorInstanceStore } from "@/state/editor-instance-store";
import { useSettingsStore } from "@/state/settings-store";
import { instantiateTemplateContent } from "@/lib/domain/editor/template-instantiation";
import { resolveWikiLinkTarget } from "@/lib/domain/editor/wiki-link-resolve";
import {
  LINK_VIEW_OPTIONS,
  applyLinkView,
  canWindowLink,
  linkViewOfNode,
  noteWindowPosByBlockId,
  wikiLinkPosFromElement,
  type LinkView,
} from "@/lib/domain/editor/link-views";
import { suggestNoteTitle } from "@/lib/domain/editor/selection-blocks";
import {
  MOVE_SELECTION_EVENT,
  type MoveSelectionEventDetail,
} from "@/components/content/editor/MoveSelectionPicker";
import { resolveExtensionVirtualContentType } from "@/lib/extensions/client-registry";
import { markdownPasteToTiptap } from "@/lib/domain/content/markdown";
import { clipboardBlockedGuidance } from "@/lib/domain/content/markdown-detect";
import { triggerBlobDownload } from "@/lib/core/download";
import { toast } from "sonner";
import {
  BOTTOM_LEFT_PANE_ID,
  BOTTOM_RIGHT_PANE_ID,
  TOP_LEFT_PANE_ID,
  TOP_RIGHT_PANE_ID,
  getPaneLabel,
  getVisiblePaneIds,
  useContentStore,
  type WorkspacePaneId,
} from "@/state/content-store";
import { ArrowUpLeft, ArrowUpRight, ArrowDownLeft, ArrowDownRight, Check } from "lucide-react";

/** Captured selection data — frozen when the context menu opens */
interface SelectionCapture {
  tiptapJson: { type: string; content: unknown[] };
  plainText: string;
}

/**
 * The editor the right-click happened in. MarkdownEditor is multi-instance
 * (split panes, Note Windows nest one editor inside another), and "the
 * first editor in the store" was whichever note mounted first — a
 * right-click inside a window acted on the host. The owning editor is the
 * one whose DOM contains the clicked element.
 */
function editorForContext(contextTarget: Element | null): Editor | null {
  const editors = Object.values(useEditorInstanceStore.getState().editorsByContentId).filter(
    (e): e is Editor => Boolean(e),
  );
  if (contextTarget) {
    const owner = editors.find((e) => e.view.dom.contains(contextTarget));
    if (owner) return owner;
  }
  return editors[0] ?? null;
}

/** The contentId an editor instance is registered under (the note it shows). */
function contentIdOfEditor(editor: Editor): string | null {
  const entry = Object.entries(useEditorInstanceStore.getState().editorsByContentId).find(
    ([, e]) => e === editor,
  );
  return entry?.[0] ?? null;
}

/**
 * Capture the current editor selection as TipTap JSON + plain text.
 * Must be called while the selection is still active (before menu closes).
 */
function captureSelection(editor: Editor | null): SelectionCapture | null {
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
 * Download an image — either from the server (via contentId) or directly from its URL.
 */
async function downloadImage(src: string, contentId: string | null) {
  try {
    if (contentId) {
      const res = await fetch(`/api/content/content/${contentId}/download?download=true`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const disposition = res.headers.get("content-disposition") ?? "";
      const fileNameMatch = disposition.match(/filename="([^"]+)"/);
      const fileName = fileNameMatch?.[1] ?? `image-${contentId}`;
      triggerBlobDownload(blob, fileName);
    } else {
      const res = await fetch(src);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const fileName = src.split("/").pop()?.split("?")[0] ?? "image";
      triggerBlobDownload(blob, fileName);
    }
    toast.success("Image downloaded");
  } catch {
    toast.error("Failed to download image");
  }
}

/**
 * Resolve a wiki-link to a content ID, then open in the given pane.
 * Shares `resolveWikiLinkTarget` with the click path so both surfaces resolve
 * identically (stable id first, exact title second).
 */
async function resolveWikiLinkAndOpen(
  ref: { targetId: string | null; targetTitle: string },
  paneId: WorkspacePaneId,
) {
  const { layoutMode, openContentInPane, setLayoutMode } = useContentStore.getState();

  // An extension's virtual content (a scripture collection) has no node.
  const virtualContentType = ref.targetId ? resolveExtensionVirtualContentType(ref.targetId) : null;
  const match =
    ref.targetId && virtualContentType
      ? { id: ref.targetId, title: ref.targetTitle, contentType: virtualContentType }
      : await resolveWikiLinkTarget(ref);
  if (!match) { toast.error(`"${ref.targetTitle}" not found`); return; }

  const visible = new Set(getVisiblePaneIds(layoutMode));
  if (!visible.has(paneId)) setLayoutMode("dual-vertical");

  openContentInPane(match.id, paneId, {
    title: match.title,
    contentType: match.contentType,
    pin: true,
  });
}

/**
 * Editor context menu action provider.
 *
 * IMPORTANT: Selection is captured HERE (while menu is open and selection active),
 * not in the onClick handlers (which run after menu closes and selection may be lost).
 */
/**
 * Flip a wiki-link's per-link context expansion.
 *
 * Links expand by default — a read of the document pulls in the target's
 * prompt-assembly text — so only an opt-out is ever stored. Finds the node by
 * position in the document rather than by identity, because the context menu
 * hands us a DOM element, not a ProseMirror node.
 */
function toggleWikiLinkExpansion(editor: Editor | null, element: Element, nextExpand: boolean | null) {
  if (!editor) return;
  const pos = wikiLinkPosFromElement(editor, element);
  if (pos === null) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "wikiLink") return;
  editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      if (dispatch) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, expand: nextExpand });
      }
      return true;
    })
    .run();
}

/**
 * "Display as" — the four link views (lib/domain/editor/link-views.ts) as
 * menu items. The same vocabulary as the hover chooser and the window
 * header; this is the keyboard-reachable, touch-reachable copy of it.
 */
function buildDisplayAsSubmenu(
  editor: Editor | null,
  resolvePos: () => number | null,
  current: LinkView | null,
  windowDisabledReason: string | null,
): ContextMenuAction[] {
  return LINK_VIEW_OPTIONS.map((option) => {
    const disabled = option.id === "window" && Boolean(windowDisabledReason);
    return {
      id: `link-view-${option.id}`,
      label: option.label,
      icon: current === option.id ? <Check className="h-4 w-4" /> : undefined,
      tooltip: disabled ? windowDisabledReason ?? undefined : option.description,
      disabled,
      onClick: () => {
        if (!editor) return;
        const pos = resolvePos();
        if (pos === null) return;
        const windowHeight = useSettingsStore.getState().editor?.noteWindowDefaultHeight ?? null;
        applyLinkView(editor, pos, option.id, { windowHeight });
      },
    };
  });
}

export const editorActionProvider: ContextMenuActionProvider = (ctx) => {
  const hasSelection = ctx.hasSelection === true;
  const sections: ContextMenuSection[] = [];

  const contextTarget = ctx.contextTarget as Element | null;
  const contextEditor = editorForContext(contextTarget);

  // --- Note Window header: display as link / chip / card ---
  const windowHeader = contextTarget?.closest?.(".nw-header");
  const windowBlockId = windowHeader
    ?.closest?.("[data-note-window-block-id]")
    ?.getAttribute("data-note-window-block-id");
  if (windowBlockId && contextEditor?.isEditable) {
    sections.push({
      actions: [
        {
          id: "note-window-display-as",
          label: "Display as",
          submenu: buildDisplayAsSubmenu(
            contextEditor,
            () => noteWindowPosByBlockId(contextEditor, windowBlockId),
            "window",
            null,
          ),
        },
      ],
    });
  }

  // --- Wiki-link actions (Open / Open in Pane / Display as) ---
  const wikiLinkEl = contextTarget?.closest?.('[data-type="wiki-link"]');
  if (wikiLinkEl) {
    const targetTitle = wikiLinkEl.getAttribute("data-target-title");
    const targetId = wikiLinkEl.getAttribute("data-target-id");
    const headingSlug = wikiLinkEl.getAttribute("data-heading-slug");
    const anchor = wikiLinkEl.getAttribute("data-anchor");
    // Default is EXPAND, so only an explicit "false" opts out.
    const isExpanded = wikiLinkEl.getAttribute("data-expand") !== "false";

    // In-document heading link: "Open" scrolls to the heading; opening in
    // another pane is a note-level concept and doesn't apply.
    if (headingSlug && !targetId && targetTitle) {
      sections.push({
        actions: [
          {
            id: "open-wiki-link",
            label: "Open",
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent("scroll-to-heading", { detail: { slug: headingSlug } })
              );
            },
          },
        ],
      });
    } else if (targetTitle) {
      const { layoutMode } = useContentStore.getState();
      const visiblePaneIds = new Set(getVisiblePaneIds(layoutMode));

      const paneOptions = [
        { id: TOP_LEFT_PANE_ID, fallback: "Left Pane", icon: <ArrowUpLeft className="h-4 w-4" /> },
        { id: TOP_RIGHT_PANE_ID, fallback: "Right Pane", icon: <ArrowUpRight className="h-4 w-4" /> },
        { id: BOTTOM_LEFT_PANE_ID, fallback: "Bottom Left Pane", icon: <ArrowDownLeft className="h-4 w-4" /> },
        { id: BOTTOM_RIGHT_PANE_ID, fallback: "Bottom Right Pane", icon: <ArrowDownRight className="h-4 w-4" /> },
      ] as Array<{ id: WorkspacePaneId; fallback: string; icon: React.ReactNode }>;

      sections.push({
        actions: [
          {
            id: "open-wiki-link",
            label: "Open",
            onClick: () => {
              window.dispatchEvent(
                new CustomEvent("open-wiki-link", { detail: { targetId, targetTitle, anchor } })
              );
            },
          },
          {
            id: "open-wiki-link-in-pane",
            label: "Open in Pane",
            submenu: paneOptions.map((pane) => ({
              id: `open-wiki-link-${pane.id}`,
              label: visiblePaneIds.has(pane.id)
                ? getPaneLabel(layoutMode, pane.id)
                : `${pane.fallback} (expand layout)`,
              icon: pane.icon,
              onClick: () => {
                void resolveWikiLinkAndOpen({ targetId, targetTitle }, pane.id);
              },
            })),
          },
          // Per-link context expansion. Reads as a PROPERTY of the link rather
          // than a command, because that is what it is — hence the check, not a
          // verb. Only an explicit opt-out is stored, so an untouched link
          // carries no attribute at all.
          {
            id: "wiki-link-include-context",
            label: "Include context",
            icon: isExpanded ? <Check className="h-4 w-4" /> : undefined,
            tooltip: isExpanded
              ? `Reading this note also reads ${targetTitle}'s summary. Turn off to link without pulling its context in.`
              : `This link is a plain reference — ${targetTitle}'s summary is not read with this note. Turn on to include it.`,
            onClick: () => {
              toggleWikiLinkExpansion(contextEditor, wikiLinkEl, isExpanded ? false : null);
            },
          },
          ...(contextEditor?.isEditable
            ? [
                {
                  id: "wiki-link-display-as",
                  label: "Display as",
                  submenu: buildDisplayAsSubmenu(
                    contextEditor,
                    () => wikiLinkPosFromElement(contextEditor, wikiLinkEl),
                    (() => {
                      const pos = wikiLinkPosFromElement(contextEditor, wikiLinkEl);
                      const node = pos === null ? null : contextEditor.state.doc.nodeAt(pos);
                      return node ? linkViewOfNode(node) : null;
                    })(),
                    anchor
                      ? "An anchored link points inside its note"
                      : targetId && !canWindowLink({ targetId })
                        ? "This target cannot be windowed"
                        : null,
                  ),
                } satisfies ContextMenuAction,
              ]
            : []),
        ],
      });
    }
  }

  // --- Image actions (Download) ---
  const imageWrapper = contextTarget?.closest?.(".image-resize-wrapper");
  const imgEl = imageWrapper?.querySelector?.("img") ?? null;
  const imageSrc = imgEl?.getAttribute("src") ?? null;
  const imageContentId = imgEl?.getAttribute("data-content-id") ?? null;

  if (imageSrc) {
    sections.push({
      actions: [
        {
          id: "download-image",
          label: "Download Image",
          onClick: () => { void downloadImage(imageSrc, imageContentId); },
        },
      ],
    });
  }

  // Capture selection NOW, before any menu interaction
  const capture = hasSelection ? captureSelection(contextEditor) : null;

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
  const editorRef = contextEditor;

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

  // Paste clipboard text INTERPRETED as Markdown → rich text. The reliable way
  // to bring in Markdown without switching to the source view. Parsing routes
  // through the (lossless) markdown converter; insertContent goes through the
  // editor, so it's collab-safe (writes into the Y.doc for collab notes).
  clipboardActions.push({
    id: "paste-markdown",
    label: "Paste as Markdown",
    onClick: async () => {
      const editor = Object.values(useEditorInstanceStore.getState().editorsByContentId).find(Boolean) ?? null;
      if (!editor) return;
      // navigator.clipboard.readText() rejects with "Document is not focused"
      // unless the document has focus — and the context-menu portal steals it.
      // Focus the editor first so the read is permitted.
      editor.commands.focus();
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        toast.error(clipboardBlockedGuidance(), { duration: 8000 });
        return;
      }
      if (!text) return;
      // Inside a code block the clipboard is code, not markdown: insert it
      // literally (a code block cannot hold the block nodes parsing yields).
      if (editor.state.selection.$from.parent.type.spec.code) {
        editor.view.dispatch(editor.state.tr.insertText(text.replace(/\r\n?/g, "\n")));
        return;
      }
      const parsed = markdownPasteToTiptap(text).content ?? [];
      if (parsed.length === 0) return;
      editor.chain().focus().insertContent(parsed).run();
    },
  });

  clipboardActions.push({
    id: "select-all",
    label: "Select All",
    shortcut: "⌘A",
    onClick: () => { editorRef?.chain().focus().selectAll().run(); },
  });

  sections.push({ actions: clipboardActions });

  // --- Move the selection out of this note. Context-menu only, by design:
  // reorganisation, not formatting. ONE item, two choices — a link stays
  // here, or nothing does — and both open the tree picker, whose "+ New
  // Note" is the way to make a new note for it (named from the selection).
  // The picker is hosted by this editor's MarkdownEditor (MoveSelectionPicker)
  // and addressed by editor instance, so only this editor's picker opens.
  if (capture && contextEditor?.isEditable) {
    const hostContentId = contentIdOfEditor(contextEditor);
    const suggestedTitle = suggestNoteTitle(capture);
    const requestMove = (trace: "none" | "link") => {
      window.dispatchEvent(
        new CustomEvent(MOVE_SELECTION_EVENT, {
          detail: {
            editor: contextEditor,
            trace,
            x: typeof ctx.contextX === "number" ? ctx.contextX : 0,
            y: typeof ctx.contextY === "number" ? ctx.contextY : 0,
            suggestedTitle,
            hostContentId,
          } satisfies MoveSelectionEventDetail,
        }),
      );
    };
    sections.push({
      actions: [
        {
          id: "move-to-note",
          label: "Move to Note",
          submenu: [
            {
              id: "move-to-note-link",
              label: "Leave a link here",
              tooltip: "Append the selection to the end of a note you pick; a link to it stays in its place",
              onClick: () => requestMove("link"),
            },
            {
              id: "move-to-note-none",
              label: "Leave nothing here",
              tooltip: "Append the selection to the end of a note you pick and remove it from this note",
              onClick: () => requestMove("none"),
            },
          ],
        },
      ],
    });
  }

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

  // Playbook Mark/Unmark moved to the FILE-TREE context menu in v3.6 (with a
  // playbook badge on the tree icon + a centered description modal). It's no
  // longer in the editor menu.

  // --- Dev tools (local development only) ---
  if (process.env.NODE_ENV === "development") {
    sections.push({
      actions: [
        {
          id: "browser-cm-hint",
          label: "Use ⌥+Click for browser context menu",
          disabled: true,
        },
      ],
    });
  }

  return sections;
};
