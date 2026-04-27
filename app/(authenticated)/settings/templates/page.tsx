/**
 * Templates & Snippets Settings Page
 *
 * Manage categories for content templates, knowledge snippets,
 * and page templates (with template listing).
 *
 * Epoch 11 Sprint 45/46
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { getSurfaceStyles } from "@/lib/design/system";
import { Plus, Trash2, GripVertical, Pencil, Check, X, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { usePageTemplateStore } from "@/state/page-template-store";
import { PageTemplateEditorDialog } from "@/components/content/dialogs/PageTemplateEditorDialog";

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  displayOrder: number;
  itemCount: number;
  isSystem?: boolean;
}

type Scope = "content_template" | "snippet" | "page_template";

function CategoryManager({ scope, title, description }: {
  scope: Scope;
  title: string;
  description: string;
}) {
  const glass0 = getSurfaceStyles("glass-0");
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/content/reusable-categories?scope=${scope}`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data = await res.json();
      // API returns flat array
      setCategories(Array.isArray(data) ? data : (data.data ?? []));
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setIsLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/content/reusable-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed, scope }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create category");
      }
      setNewName("");
      toast.success(`Category "${trimmed}" created`);
      fetchCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const handleRename = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(`/api/content/reusable-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      setEditingId(null);
      toast.success("Category renamed");
      fetchCategories();
    } catch {
      toast.error("Failed to rename category");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"? Items in this category will also be deleted.`)) return;

    try {
      const res = await fetch(`/api/content/reusable-categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Category "${name}" deleted`);
      fetchCategories();
    } catch {
      toast.error("Failed to delete category");
    }
  };

  return (
    <div
      className="border border-white/10 rounded-lg p-6"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-400 mb-4">{description}</p>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Category list */}
          <div className="space-y-1.5 mb-4">
            {categories.length === 0 && (
              <p className="text-sm text-gray-500 italic py-2">
                No categories yet. Create one below.
              </p>
            )}
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="flex items-center gap-2 p-2 rounded-lg border border-white/10 bg-white/[0.03] group"
              >
                <GripVertical className="h-3.5 w-3.5 text-gray-600 shrink-0" />

                {editingId === cat.id ? (
                  <div className="flex-1 flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(cat.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="flex-1 px-2 py-1 bg-black/20 border border-white/20 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleRename(cat.id)}
                      className="p-1 rounded hover:bg-green-500/10 text-green-400"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded hover:bg-white/10 text-gray-400"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{cat.name}</span>
                    <span className="text-xs text-gray-500">
                      {cat.itemCount} item{cat.itemCount !== 1 ? "s" : ""}
                    </span>
                    {!cat.isSystem && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(cat.id);
                            setEditingName(cat.name);
                          }}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat.id, cat.name)}
                          className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create new */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New category name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
              }}
              className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Page Template Manager ----------

interface PageTemplateItem {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  isSystem: boolean;
  defaultTitle: string | null;
  usageCount: number;
  createdAt: string;
}

function PageTemplateManager() {
  const glass0 = getSurfaceStyles("glass-0");
  const [templates, setTemplates] = useState<PageTemplateItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editorTemplateId, setEditorTemplateId] = useState<string | null>(null);

  // Also refresh the global page template store so menus stay in sync
  const refreshGlobalStore = usePageTemplateStore((s) => s.fetchTemplates);
  const refreshGlobalCategories = usePageTemplateStore((s) => s.fetchCategories);

  const fetchData = useCallback(async () => {
    try {
      const [catRes, tplRes] = await Promise.all([
        fetch("/api/content/reusable-categories?scope=page_template", { credentials: "include" }),
        fetch("/api/content/page-templates", { credentials: "include" }),
      ]);

      if (catRes.ok) {
        const catData = await catRes.json();
        const cats: CategoryItem[] = Array.isArray(catData) ? catData : [];
        setCategories(cats);
        // Auto-expand all categories on first load
        setExpandedCategories((prev) => {
          if (prev.size === 0) return new Set(cats.map((c: CategoryItem) => c.id));
          return prev;
        });
      }

      if (tplRes.ok) {
        const tplData = await tplRes.json();
        setTemplates(Array.isArray(tplData) ? tplData : []);
      }
    } catch {
      toast.error("Failed to load page templates");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteTemplate = async (id: string, title: string) => {
    if (!confirm(`Delete template "${title}"? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/content/page-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Template "${title}" deleted`);
      fetchData();
      refreshGlobalStore();
    } catch {
      toast.error("Failed to delete template");
    }
  };

  // Category CRUD (inline)
  const [newCategoryName, setNewCategoryName] = useState("");

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch("/api/content/reusable-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed, scope: "page_template" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create category");
      }
      setNewCategoryName("");
      toast.success(`Category "${trimmed}" created`);
      fetchData();
      refreshGlobalCategories();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create");
    }
  };

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const handleRenameCategory = async (id: string) => {
    const trimmed = editingCatName.trim();
    if (!trimmed) return;

    try {
      const res = await fetch(`/api/content/reusable-categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) throw new Error("Failed to rename");
      setEditingCatId(null);
      toast.success("Category renamed");
      fetchData();
      refreshGlobalCategories();
    } catch {
      toast.error("Failed to rename category");
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const tplCount = templates.filter((t) => t.categoryId === id).length;
    const msg = tplCount > 0
      ? `Delete category "${name}" and its ${tplCount} template${tplCount !== 1 ? "s" : ""}? This cannot be undone.`
      : `Delete category "${name}"?`;
    if (!confirm(msg)) return;

    try {
      const res = await fetch(`/api/content/reusable-categories/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Category "${name}" deleted`);
      fetchData();
      refreshGlobalCategories();
      refreshGlobalStore();
    } catch {
      toast.error("Failed to delete category");
    }
  };

  const templatesByCategory = categories.map((cat) => ({
    category: cat,
    templates: templates.filter((t) => t.categoryId === cat.id),
  }));

  // Templates without a matching category (orphaned)
  const categoryIds = new Set(categories.map((c) => c.id));
  const orphanedTemplates = templates.filter((t) => !categoryIds.has(t.categoryId));
  const refreshTemplateViews = useCallback(() => {
    fetchData();
    refreshGlobalStore();
  }, [fetchData, refreshGlobalStore]);

  return (
    <div
      className="border border-white/10 rounded-lg p-6"
      style={{
        background: glass0.background,
        backdropFilter: glass0.backdropFilter,
      }}
    >
      <h3 className="text-lg font-semibold mb-1">Page Templates</h3>
      <p className="text-sm text-gray-400 mb-4">
        Full-document blueprints that appear in the &quot;New &gt; Note&quot; menu. Save templates from the editor toolbar.
      </p>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Categories + Templates tree */}
          <div className="space-y-2 mb-4">
            {categories.length === 0 && templates.length === 0 && (
              <p className="text-sm text-gray-500 italic py-2">
                No page templates yet. Save one from the editor toolbar.
              </p>
            )}

            {templatesByCategory.map(({ category: cat, templates: catTemplates }) => (
              <div key={cat.id} className="border border-white/10 rounded-lg overflow-hidden">
                {/* Category header */}
                <div className="flex items-center gap-2 p-2 bg-white/[0.03] group">
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="p-0.5 rounded hover:bg-white/10 text-gray-400"
                  >
                    {expandedCategories.has(cat.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {editingCatId === cat.id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameCategory(cat.id);
                          if (e.key === "Escape") setEditingCatId(null);
                        }}
                        autoFocus
                        className="flex-1 px-2 py-0.5 bg-black/20 border border-white/20 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleRenameCategory(cat.id)}
                        className="p-1 rounded hover:bg-green-500/10 text-green-400"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="p-1 rounded hover:bg-white/10 text-gray-400"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium">{cat.name}</span>
                      {cat.isSystem && (
                        <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">System</span>
                      )}
                      <span className="text-xs text-gray-500">
                        {catTemplates.length} template{catTemplates.length !== 1 ? "s" : ""}
                      </span>
                      {!cat.isSystem && (
                        <>
                          <button
                            onClick={() => {
                              setEditingCatId(cat.id);
                              setEditingCatName(cat.name);
                            }}
                            className="p-1 rounded hover:bg-white/10 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Template list */}
                {expandedCategories.has(cat.id) && (
                  <div className="border-t border-white/5">
                    {catTemplates.length === 0 ? (
                      <p className="text-xs text-gray-500 italic py-2 px-4">
                        No templates in this category
                      </p>
                    ) : (
                      catTemplates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className="flex items-center gap-2 px-4 py-1.5 border-t border-white/5 first:border-t-0 group/tpl"
                        >
                          <FileText className="h-3.5 w-3.5 text-gray-500 shrink-0" />

                          <>
                            <button
                              type="button"
                              onClick={() => {
                                if (!tpl.isSystem) setEditorTemplateId(tpl.id);
                              }}
                              className={`flex-1 text-left text-sm ${
                                tpl.isSystem
                                  ? "cursor-default text-gray-300"
                                  : "text-gray-300 hover:text-white"
                              }`}
                            >
                              {tpl.title}
                            </button>
                            {tpl.isSystem && (
                              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">System</span>
                            )}
                            {tpl.usageCount > 0 && (
                              <span className="text-[10px] text-gray-500">
                                used {tpl.usageCount}x
                              </span>
                            )}
                            {!tpl.isSystem && (
                              <>
                                <button
                                  onClick={() => setEditorTemplateId(tpl.id)}
                                  className="p-1 rounded hover:bg-white/10 text-gray-500 opacity-0 group-hover/tpl:opacity-100 transition-opacity"
                                  title="Edit page template"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(tpl.id, tpl.title)}
                                  className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover/tpl:opacity-100 transition-opacity"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </>
                            )}
                          </>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Orphaned templates (no matching category) */}
            {orphanedTemplates.length > 0 && (
              <div className="border border-white/10 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 p-2 bg-white/[0.03]">
                  <span className="flex-1 text-sm font-medium text-yellow-400/80">Uncategorized</span>
                  <span className="text-xs text-gray-500">
                    {orphanedTemplates.length} template{orphanedTemplates.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="border-t border-white/5">
                  {orphanedTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="flex items-center gap-2 px-4 py-1.5 border-t border-white/5 first:border-t-0 group/tpl"
                    >
                      <FileText className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                      <button
                        type="button"
                        onClick={() => {
                          if (!tpl.isSystem) setEditorTemplateId(tpl.id);
                        }}
                        className={`flex-1 text-left text-sm ${
                          tpl.isSystem
                            ? "cursor-default text-gray-300"
                            : "text-gray-300 hover:text-white"
                        }`}
                      >
                        {tpl.title}
                      </button>
                      {!tpl.isSystem && (
                        <>
                          <button
                            onClick={() => setEditorTemplateId(tpl.id)}
                            className="p-1 rounded hover:bg-white/10 text-gray-500 opacity-0 group-hover/tpl:opacity-100 transition-opacity"
                            title="Edit page template"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(tpl.id, tpl.title)}
                            className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400 opacity-0 group-hover/tpl:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Add category */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="New category name..."
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreateCategory();
                }
              }}
              className="flex-1 px-3 py-2 bg-black/20 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 rounded-lg text-sm font-medium text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Category
            </button>
          </div>
        </>
      )}
      <PageTemplateEditorDialog
        open={editorTemplateId !== null}
        templateId={editorTemplateId}
        onOpenChange={(open) => {
          if (!open) setEditorTemplateId(null);
        }}
        onSaved={refreshTemplateViews}
        onDeleted={refreshTemplateViews}
      />
    </div>
  );
}

export default function TemplatesSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Templates & Snippets</h1>
        <p className="text-muted-foreground mt-2">
          Manage categories and templates for content creation
        </p>
      </div>

      <PageTemplateManager />

      <CategoryManager
        scope="content_template"
        title="Content Template Categories"
        description="Organize reusable text fragments saved from your editor."
      />

      <CategoryManager
        scope="snippet"
        title="Snippet Categories"
        description="Organize knowledge snippets used for AI context and quick reference."
      />
    </div>
  );
}
