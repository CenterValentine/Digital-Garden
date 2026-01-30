# M10: Advanced TipTap Editor Features

**Status:** 📋 **PLANNED** (Not Started)
**Prerequisites:** M9 (Type System Refactor) Complete
**Estimated Time:** 2-3 weeks
**Complexity:** High
**Priority:** High (Foundation for AI, collaboration, templates)

---

## Overview

M10 enhances the TipTap editor with advanced features, architectural improvements, and extensibility that enables AI integration (M11), real-time collaboration (M12+), and powerful templates.

**What Users Get:**
- 📝 Comments & suggestions (Google Docs-style)
- 🎨 Custom styles and themes
- 🔗 Enhanced linking with previews
- 📋 Template system
- ⚡ Better performance for large documents
- 🏗️ Plugin architecture for extensions

**What Developers Get:**
- 🤖 Structured content extraction API (for AI)
- 🔌 Plugin system for custom extensions
- 📦 Custom node/mark architecture
- 🧩 Modular extension system
- 🚀 Performance optimizations

---

## Why M10 Before AI (M11)?

`★ Insight ─────────────────────────────────────`
**Strategic Positioning:**
1. **AI needs structure** - Structured content extraction makes AI smarter
2. **Templates need foundation** - Template system enables AI-powered templates
3. **Performance first** - Large documents must work before adding AI overhead
4. **Extension points** - Plugin architecture lets AI hook into editor cleanly
5. **Collaboration prep** - CRDT-friendly architecture enables future real-time
`─────────────────────────────────────────────────`

**M10 enables M11 to:**
- Extract structured content (headings, lists, tables) for AI context
- Insert AI suggestions as tracked changes
- Generate templates from AI responses
- Add AI-powered autocomplete via editor plugins

---

## Implementation Phases

### Phase 1: Core Extensions (Week 1)

**Goal:** Add advanced editing features that power users expect

#### 1. Comments & Suggestions

**File:** `lib/domain/editor/extensions/comments.ts`

```typescript
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface Comment {
  id: string;
  userId: string;
  username: string;
  content: string;
  resolved: boolean;
  createdAt: Date;
  position: { from: number; to: number };
}

export const Comments = Extension.create({
  name: 'comments',

  addStorage() {
    return {
      comments: [] as Comment[],
      activeCommentId: null as string | null,
    };
  },

  addCommands() {
    return {
      addComment: (comment: Omit<Comment, 'id' | 'createdAt'>) => ({ commands }) => {
        const id = generateCommentId();
        const newComment: Comment = {
          ...comment,
          id,
          createdAt: new Date(),
        };

        this.storage.comments.push(newComment);
        return commands.updateAttributes('commentMark', { commentId: id });
      },

      resolveComment: (commentId: string) => () => {
        const comment = this.storage.comments.find(c => c.id === commentId);
        if (comment) comment.resolved = true;
        return true;
      },

      deleteComment: (commentId: string) => () => {
        this.storage.comments = this.storage.comments.filter(c => c.id !== commentId);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            // Add decorations for comments
            const comments = this.storage.comments;
            const decorations = comments
              .filter(c => !c.resolved)
              .map(c => Decoration.inline(c.position.from, c.position.to, {
                class: 'comment-highlight',
                'data-comment-id': c.id,
              }));

            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
```

**UI Component:** `components/editor/CommentsSidebar.tsx`

```typescript
'use client';

import { useEditor } from '@tiptap/react';
import { Comment } from '@/lib/domain/editor/extensions/comments';

export function CommentsSidebar({ editor }: { editor: any }) {
  const comments = editor.storage.comments.comments as Comment[];

  return (
    <div className="w-80 border-l p-4 space-y-4">
      <h3 className="font-semibold">Comments</h3>

      {comments.filter(c => !c.resolved).map(comment => (
        <div key={comment.id} className="border rounded-lg p-3">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-medium">{comment.username}</span>
              <p className="text-sm text-gray-600 mt-1">{comment.content}</p>
            </div>
            <button
              onClick={() => editor.commands.resolveComment(comment.id)}
              className="text-xs text-blue-500"
            >
              Resolve
            </button>
          </div>
          <span className="text-xs text-gray-400">
            {comment.createdAt.toLocaleString()}
          </span>
        </div>
      ))}

      {comments.filter(c => !c.resolved).length === 0 && (
        <p className="text-sm text-gray-500">No active comments</p>
      )}
    </div>
  );
}
```

#### 2. Track Changes (Suggestions)

**File:** `lib/domain/editor/extensions/track-changes.ts`

```typescript
import { Mark } from '@tiptap/core';

export interface Suggestion {
  id: string;
  userId: string;
  username: string;
  type: 'insert' | 'delete' | 'format';
  accepted: boolean;
  rejected: boolean;
  createdAt: Date;
}

export const TrackChanges = Mark.create({
  name: 'suggestion',

  addAttributes() {
    return {
      suggestionId: { default: null },
      suggestionType: { default: 'insert' },
      userId: { default: null },
      username: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-suggestion]',
        getAttrs: (node) => ({
          suggestionId: node.getAttribute('data-suggestion-id'),
          suggestionType: node.getAttribute('data-suggestion-type'),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      {
        ...HTMLAttributes,
        class: `suggestion suggestion-${HTMLAttributes.suggestionType}`,
        'data-suggestion': true,
        'data-suggestion-id': HTMLAttributes.suggestionId,
        'data-suggestion-type': HTMLAttributes.suggestionType,
      },
      0,
    ];
  },

  addCommands() {
    return {
      acceptSuggestion: (suggestionId: string) => ({ commands }) => {
        // Remove the mark but keep the content
        return commands.unsetMark('suggestion', { suggestionId });
      },

      rejectSuggestion: (suggestionId: string) => ({ commands, tr }) => {
        // Remove the mark and the content
        tr.doc.descendants((node, pos) => {
          if (node.marks.find(m => m.attrs.suggestionId === suggestionId)) {
            tr.delete(pos, pos + node.nodeSize);
          }
        });
        return true;
      },
    };
  },
});
```

#### 3. Custom Nodes (Callout Enhancement)

**File:** `lib/domain/editor/extensions/enhanced-callout.ts`

```typescript
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import CalloutNodeView from '@/components/editor/CalloutNodeView';

export const EnhancedCallout = Node.create({
  name: 'enhancedCallout',

  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      type: {
        default: 'note',
        parseHTML: element => element.getAttribute('data-type'),
        renderHTML: attributes => ({ 'data-type': attributes.type }),
      },
      title: {
        default: '',
        parseHTML: element => element.getAttribute('data-title'),
        renderHTML: attributes => ({ 'data-title': attributes.title }),
      },
      collapsed: {
        default: false,
        parseHTML: element => element.getAttribute('data-collapsed') === 'true',
        renderHTML: attributes => ({ 'data-collapsed': attributes.collapsed }),
      },
      icon: {
        default: null,
        parseHTML: element => element.getAttribute('data-icon'),
        renderHTML: attributes => ({ 'data-icon': attributes.icon }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': true }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },

  addCommands() {
    return {
      setCallout: (attributes) => ({ commands }) => {
        return commands.wrapIn(this.name, attributes);
      },
    };
  },
});
```

**Phase 1 Deliverables:**
- ✅ Comments extension with sidebar UI
- ✅ Track changes (suggestions) mark
- ✅ Enhanced callout with custom icons, collapsible
- ✅ Custom node examples (info boxes, diagrams)

---

### Phase 2: Advanced Features (Week 2)

**Goal:** Templates, embeds, and better tables

#### 4. Template System

**File:** `lib/domain/editor/templates/template-system.ts`

```typescript
export interface Template {
  id: string;
  name: string;
  description: string;
  category: 'note' | 'meeting' | 'project' | 'research' | 'custom';
  content: any; // TipTap JSON
  variables: TemplateVariable[];
  createdAt: Date;
  createdBy: string;
}

export interface TemplateVariable {
  key: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'multiline';
  default?: string;
  options?: string[]; // For select type
  required: boolean;
}

export class TemplateSystem {
  static async getTemplates(category?: string): Promise<Template[]> {
    // Fetch from database
    const response = await fetch(`/api/content/templates${category ? `?category=${category}` : ''}`);
    return response.json();
  }

  static async insertTemplate(
    editor: any,
    template: Template,
    values: Record<string, string>
  ): Promise<void> {
    // Replace variables in template content
    const processedContent = this.replaceVariables(template.content, template.variables, values);

    // Insert into editor
    editor.commands.insertContent(processedContent);
  }

  static replaceVariables(
    content: any,
    variables: TemplateVariable[],
    values: Record<string, string>
  ): any {
    const jsonString = JSON.stringify(content);

    // Replace {{variable}} patterns
    let processed = jsonString;
    variables.forEach(variable => {
      const pattern = new RegExp(`\\{\\{${variable.key}\\}\\}`, 'g');
      const value = values[variable.key] || variable.default || '';
      processed = processed.replace(pattern, value);
    });

    return JSON.parse(processed);
  }

  static async saveAsTemplate(
    editor: any,
    templateInfo: {
      name: string;
      description: string;
      category: string;
      variables: TemplateVariable[];
    }
  ): Promise<Template> {
    const content = editor.getJSON();

    const response = await fetch('/api/content/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...templateInfo,
        content,
      }),
    });

    return response.json();
  }
}
```

**UI Component:** `components/editor/TemplateDialog.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { TemplateSystem, Template } from '@/lib/domain/editor/templates/template-system';
import { Dialog, DialogContent } from '@/components/ui/dialog';

export function TemplateDialog({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editor: any;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      TemplateSystem.getTemplates().then(setTemplates);
    }
  }, [open]);

  const handleInsert = async () => {
    if (!selectedTemplate) return;

    await TemplateSystem.insertTemplate(editor, selectedTemplate, values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <h2 className="text-xl font-bold">Insert Template</h2>

        <div className="grid grid-cols-2 gap-4">
          {/* Template list */}
          <div className="space-y-2">
            <h3 className="font-semibold">Templates</h3>
            {templates.map(template => (
              <button
                key={template.id}
                onClick={() => setSelectedTemplate(template)}
                className={`w-full text-left p-3 border rounded-lg ${
                  selectedTemplate?.id === template.id ? 'border-blue-500' : ''
                }`}
              >
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-gray-500">{template.description}</div>
              </button>
            ))}
          </div>

          {/* Template variables */}
          {selectedTemplate && (
            <div className="space-y-4">
              <h3 className="font-semibold">Fill in Details</h3>
              {selectedTemplate.variables.map(variable => (
                <div key={variable.key}>
                  <label className="block text-sm font-medium mb-1">
                    {variable.label}
                    {variable.required && <span className="text-red-500">*</span>}
                  </label>

                  {variable.type === 'text' && (
                    <input
                      type="text"
                      value={values[variable.key] || ''}
                      onChange={(e) => setValues({ ...values, [variable.key]: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      placeholder={variable.default}
                    />
                  )}

                  {variable.type === 'date' && (
                    <input
                      type="date"
                      value={values[variable.key] || ''}
                      onChange={(e) => setValues({ ...values, [variable.key]: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  )}

                  {variable.type === 'select' && (
                    <select
                      value={values[variable.key] || ''}
                      onChange={(e) => setValues({ ...values, [variable.key]: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                    >
                      <option value="">Select...</option>
                      {variable.options?.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  )}

                  {variable.type === 'multiline' && (
                    <textarea
                      value={values[variable.key] || ''}
                      onChange={(e) => setValues({ ...values, [variable.key]: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      rows={4}
                      placeholder={variable.default}
                    />
                  )}
                </div>
              ))}

              <button
                onClick={handleInsert}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg"
              >
                Insert Template
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

#### 5. Enhanced Tables

**File:** `lib/domain/editor/extensions/enhanced-table.ts`

```typescript
import { Table } from '@tiptap/extension-table';

export const EnhancedTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headerRows: {
        default: 1,
        parseHTML: element => parseInt(element.getAttribute('data-header-rows') || '1'),
        renderHTML: attributes => ({ 'data-header-rows': attributes.headerRows }),
      },
      headerColumns: {
        default: 0,
        parseHTML: element => parseInt(element.getAttribute('data-header-columns') || '0'),
        renderHTML: attributes => ({ 'data-header-columns': attributes.headerColumns }),
      },
      striped: {
        default: false,
        parseHTML: element => element.getAttribute('data-striped') === 'true',
        renderHTML: attributes => ({ 'data-striped': attributes.striped }),
      },
      bordered: {
        default: true,
        parseHTML: element => element.getAttribute('data-bordered') !== 'false',
        renderHTML: attributes => ({ 'data-bordered': attributes.bordered }),
      },
      compact: {
        default: false,
        parseHTML: element => element.getAttribute('data-compact') === 'true',
        renderHTML: attributes => ({ 'data-compact': attributes.compact }),
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      insertTableWithHeader: ({ rows = 3, cols = 3, headerRows = 1 }) => ({ commands }) => {
        return commands.insertTable({ rows, cols, withHeaderRow: headerRows > 0 });
      },

      setTableStyle: (style: { striped?: boolean; bordered?: boolean; compact?: boolean }) => ({ commands }) => {
        return commands.updateAttributes('table', style);
      },

      sortTableByColumn: (columnIndex: number, ascending = true) => ({ tr, state }) => {
        // Implement table sorting logic
        // ... sorting implementation
        return true;
      },
    };
  },
});
```

#### 6. Link Previews & Embeds

**File:** `lib/domain/editor/extensions/link-preview.ts`

```typescript
import { Link } from '@tiptap/extension-link';
import { Plugin } from '@tiptap/pm/state';

export const LinkPreview = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      previewData: {
        default: null,
        parseHTML: element => {
          const data = element.getAttribute('data-preview');
          return data ? JSON.parse(data) : null;
        },
        renderHTML: attributes => {
          return attributes.previewData
            ? { 'data-preview': JSON.stringify(attributes.previewData) }
            : {};
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mouseover: (view, event) => {
              const target = event.target as HTMLElement;
              if (target.tagName === 'A') {
                const href = target.getAttribute('href');
                if (href) {
                  this.showPreview(href, target);
                }
              }
              return false;
            },
          },
        },
      }),
    ];
  },

  showPreview(url: string, element: HTMLElement) {
    // Fetch Open Graph data and show preview tooltip
    fetch(`/api/content/external/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
      .then(res => res.json())
      .then(data => {
        // Show tooltip with preview
        this.renderPreviewTooltip(data, element);
      });
  },

  renderPreviewTooltip(previewData: any, element: HTMLElement) {
    // Implementation of preview tooltip
  },
});
```

**Phase 2 Deliverables:**
- ✅ Template system with variables
- ✅ Template dialog UI
- ✅ Enhanced tables (sorting, styling, header rows/columns)
- ✅ Link previews with Open Graph
- ✅ Embed support (YouTube, Twitter, etc.)

---

### Phase 3: Architecture & Performance (Week 3)

**Goal:** Plugin system, performance, AI preparation

#### 7. Content Extraction API (for AI)

**File:** `lib/domain/editor/content-extraction.ts`

```typescript
/**
 * Content Extraction API for AI Integration
 *
 * Provides structured content extraction from TipTap JSON
 * for AI context building.
 */

export interface ExtractedContent {
  text: string;
  structure: DocumentStructure;
  metadata: ContentMetadata;
}

export interface DocumentStructure {
  headings: Heading[];
  lists: ListItem[];
  tables: TableData[];
  codeBlocks: CodeBlock[];
  callouts: Callout[];
  links: Link[];
}

export interface Heading {
  level: number;
  text: string;
  position: number;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  position: number;
}

export interface ContentMetadata {
  wordCount: number;
  characterCount: number;
  estimatedReadingTime: number;
  language: string;
  topics: string[];
}

export class ContentExtractor {
  /**
   * Extract full structured content from TipTap JSON
   */
  static extractAll(tiptapJson: any): ExtractedContent {
    return {
      text: this.extractPlainText(tiptapJson),
      structure: this.extractStructure(tiptapJson),
      metadata: this.extractMetadata(tiptapJson),
    };
  }

  /**
   * Extract only plain text (for simple AI context)
   */
  static extractPlainText(tiptapJson: any): string {
    let text = '';

    function traverse(node: any) {
      if (node.type === 'text') {
        text += node.text;
      }

      if (node.content) {
        node.content.forEach(traverse);
      }

      // Add spacing for block elements
      if (['paragraph', 'heading'].includes(node.type)) {
        text += '\n';
      }
    }

    traverse(tiptapJson);
    return text.trim();
  }

  /**
   * Extract document structure (headings, lists, tables)
   */
  static extractStructure(tiptapJson: any): DocumentStructure {
    const headings: Heading[] = [];
    const lists: ListItem[] = [];
    const tables: TableData[] = [];
    const codeBlocks: CodeBlock[] = [];
    const callouts: Callout[] = [];
    const links: Link[] = [];

    let position = 0;

    function traverse(node: any) {
      // Extract headings
      if (node.type === 'heading') {
        headings.push({
          level: node.attrs.level,
          text: extractTextFromNode(node),
          position,
        });
      }

      // Extract tables
      if (node.type === 'table') {
        const tableData = this.extractTableData(node);
        tables.push({ ...tableData, position });
      }

      // Extract code blocks
      if (node.type === 'codeBlock') {
        codeBlocks.push({
          language: node.attrs.language,
          code: extractTextFromNode(node),
          position,
        });
      }

      // Extract callouts
      if (node.type === 'callout' || node.type === 'enhancedCallout') {
        callouts.push({
          type: node.attrs.type,
          title: node.attrs.title,
          content: extractTextFromNode(node),
          position,
        });
      }

      // Extract links
      if (node.marks?.some((m: any) => m.type === 'link')) {
        const linkMark = node.marks.find((m: any) => m.type === 'link');
        links.push({
          href: linkMark.attrs.href,
          text: node.text,
          position,
        });
      }

      if (node.content) {
        node.content.forEach(traverse);
      }

      position++;
    }

    traverse(tiptapJson);

    return { headings, lists, tables, codeBlocks, callouts, links };
  }

  /**
   * Extract table data as 2D array
   */
  static extractTableData(tableNode: any): { headers: string[]; rows: string[][] } {
    const rows: string[][] = [];

    tableNode.content?.forEach((rowNode: any) => {
      const cells: string[] = [];
      rowNode.content?.forEach((cellNode: any) => {
        cells.push(extractTextFromNode(cellNode));
      });
      rows.push(cells);
    });

    const headers = rows[0] || [];
    const dataRows = rows.slice(1);

    return { headers, rows: dataRows };
  }

  /**
   * Extract metadata (word count, topics, etc.)
   */
  static extractMetadata(tiptapJson: any): ContentMetadata {
    const text = this.extractPlainText(tiptapJson);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const chars = text.length;

    return {
      wordCount: words.length,
      characterCount: chars,
      estimatedReadingTime: Math.ceil(words.length / 200), // 200 words/min
      language: 'en', // TODO: Detect language
      topics: this.extractTopics(tiptapJson),
    };
  }

  /**
   * Extract topics from headings and content
   */
  static extractTopics(tiptapJson: any): string[] {
    const structure = this.extractStructure(tiptapJson);
    return structure.headings.map(h => h.text);
  }

  /**
   * Format extracted content for AI context (markdown)
   */
  static formatForAI(extracted: ExtractedContent): string {
    let markdown = `# Document Content\n\n`;

    // Add metadata
    markdown += `**Metadata:**\n`;
    markdown += `- Word Count: ${extracted.metadata.wordCount}\n`;
    markdown += `- Reading Time: ${extracted.metadata.estimatedReadingTime} min\n\n`;

    // Add structure
    markdown += `**Document Structure:**\n`;
    extracted.structure.headings.forEach(h => {
      markdown += `${'  '.repeat(h.level - 1)}- ${h.text}\n`;
    });

    markdown += `\n**Full Content:**\n\n${extracted.text}`;

    return markdown;
  }
}

function extractTextFromNode(node: any): string {
  // Helper to extract text from a node
  if (node.type === 'text') return node.text;
  if (node.content) {
    return node.content.map(extractTextFromNode).join('');
  }
  return '';
}
```

#### 8. Plugin System

**File:** `lib/domain/editor/plugin-system.ts`

```typescript
/**
 * Editor Plugin System
 *
 * Allows third-party extensions to hook into the editor.
 */

export interface EditorPlugin {
  name: string;
  version: string;
  extensions?: any[]; // TipTap extensions
  commands?: Record<string, any>; // Custom commands
  keyboardShortcuts?: Record<string, any>;
  onMount?: (editor: any) => void;
  onUpdate?: (editor: any) => void;
  onDestroy?: () => void;
}

export class PluginManager {
  private plugins: Map<string, EditorPlugin> = new Map();
  private editor: any;

  constructor(editor: any) {
    this.editor = editor;
  }

  register(plugin: EditorPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin "${plugin.name}" already registered`);
      return;
    }

    this.plugins.set(plugin.name, plugin);

    // Add extensions
    if (plugin.extensions) {
      this.editor.extensionManager.addExtensions(plugin.extensions);
    }

    // Add commands
    if (plugin.commands) {
      Object.entries(plugin.commands).forEach(([name, command]) => {
        this.editor.commands[name] = command;
      });
    }

    // Call onMount hook
    plugin.onMount?.(this.editor);
  }

  unregister(pluginName: string): void {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) return;

    plugin.onDestroy?.();
    this.plugins.delete(pluginName);
  }

  getPlugin(name: string): EditorPlugin | undefined {
    return this.plugins.get(name);
  }

  getAllPlugins(): EditorPlugin[] {
    return Array.from(this.plugins.values());
  }
}

// Example AI Plugin (to be used in M11)
export const AIAssistantPlugin: EditorPlugin = {
  name: 'ai-assistant',
  version: '1.0.0',

  commands: {
    summarizeSelection: ({ editor }: any) => {
      const { from, to } = editor.state.selection;
      const text = editor.state.doc.textBetween(from, to);

      // Call AI API (implemented in M11)
      fetch('/api/ai/summarize', {
        method: 'POST',
        body: JSON.stringify({ text }),
      })
        .then(res => res.json())
        .then(data => {
          editor.commands.insertContentAt(to, data.summary);
        });
    },
  },

  keyboardShortcuts: {
    'Mod-Shift-a': ({ editor }: any) => {
      return editor.commands.summarizeSelection();
    },
  },
};
```

#### 9. Performance Optimizations

**File:** `lib/domain/editor/performance.ts`

```typescript
/**
 * Performance optimizations for large documents
 */

import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

export const PerformanceOptimizations = Extension.create({
  name: 'performanceOptimizations',

  addProseMirrorPlugins() {
    return [
      // Debounce updates
      new Plugin({
        view() {
          let timeout: NodeJS.Timeout;

          return {
            update: (view, prevState) => {
              clearTimeout(timeout);
              timeout = setTimeout(() => {
                // Trigger update events
              }, 100);
            },
          };
        },
      }),

      // Virtual scrolling for large documents
      new Plugin({
        view() {
          return {
            update: (view) => {
              // Only render visible nodes
              const { from, to } = view.state.selection;
              const visibleRange = { from: Math.max(0, from - 1000), to: to + 1000 };

              // Hide nodes outside visible range
              view.state.doc.descendants((node, pos) => {
                if (pos < visibleRange.from || pos > visibleRange.to) {
                  // Mark as not needing rendering
                }
              });
            },
          };
        },
      }),
    ];
  },

  onCreate() {
    // Lazy load extensions
    this.editor.setOptions({
      editorProps: {
        attributes: {
          spellcheck: 'false', // Disable until user enables
        },
      },
    });
  },
});

/**
 * Measure editor performance
 */
export class EditorPerformanceMonitor {
  static measureRenderTime(editor: any): number {
    const start = performance.now();
    editor.view.updateState(editor.state);
    const end = performance.now();
    return end - start;
  }

  static measureContentExtractionTime(tiptapJson: any): number {
    const start = performance.now();
    ContentExtractor.extractAll(tiptapJson);
    const end = performance.now();
    return end - start;
  }

  static getDocumentSize(editor: any): {
    nodeCount: number;
    textLength: number;
    memoryEstimate: number;
  } {
    let nodeCount = 0;
    let textLength = 0;

    editor.state.doc.descendants((node: any) => {
      nodeCount++;
      if (node.isText) {
        textLength += node.text.length;
      }
    });

    const memoryEstimate = JSON.stringify(editor.getJSON()).length;

    return { nodeCount, textLength, memoryEstimate };
  }
}
```

**Phase 3 Deliverables:**
- ✅ Content extraction API (for M11 AI)
- ✅ Plugin system architecture
- ✅ Performance optimizations (debouncing, virtual scrolling)
- ✅ Large document handling
- ✅ Performance monitoring tools

---

## Integration Points for Future Milestones

### M11: AI Chat Integration

**M10 Provides:**
- `ContentExtractor.formatForAI()` - Structured content for AI context
- Plugin system - AI hooks into editor commands
- Track changes extension - AI suggestions as tracked changes
- Template system - AI generates templates

**M11 Uses:**
```typescript
import { ContentExtractor } from '@/lib/domain/editor/content-extraction';
import { PluginManager } from '@/lib/domain/editor/plugin-system';

// In AI chat service
const extracted = ContentExtractor.extractAll(editor.getJSON());
const aiContext = ContentExtractor.formatForAI(extracted);

// Send to AI
const response = await streamText({
  model: anthropic('claude-sonnet-4-5'),
  messages: [
    { role: 'system', content: aiContext },
    { role: 'user', content: userMessage },
  ],
});

// Insert AI response as suggestion
editor.commands.insertContent(response.content, {
  updateSelection: false,
});
editor.commands.setMark('suggestion', {
  suggestionId: generateId(),
  suggestionType: 'insert',
  userId: 'ai',
  username: 'AI Assistant',
});
```

### M12: Real-time Collaboration

**M10 Provides:**
- Comments system (already collaborative-ready)
- Suggestions system (conflict-free edits)
- Plugin architecture (add collaboration extension)

**M12 Uses:**
- Yjs for CRDT
- WebSocket for real-time sync
- Conflict resolution via suggestions

### Templates & Command Palette

**M10 Provides:**
- Template system foundation
- Template variables
- Template insertion API

**Command Palette Uses:**
```typescript
// In command palette
{
  name: 'Insert Template',
  action: () => openTemplateDialog(),
  keywords: ['template', 'insert', 'snippet'],
}
```

---

## Database Changes

### New Table: Template

```prisma
model Template {
  id          String   @id @default(uuid()) @db.Uuid
  userId      String   @db.Uuid
  name        String   @db.VarChar(200)
  description String?  @db.Text
  category    String   @db.VarChar(50) // "note" | "meeting" | "project" | etc.
  content     Json     @db.JsonB // TipTap JSON
  variables   Json     @default("[]") @db.JsonB // TemplateVariable[]
  isPublic    Boolean  @default(false)
  usageCount  Int      @default(0)
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @db.Timestamptz(6)

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, category])
  @@index([isPublic, usageCount(sort: Desc)])
}

// Update User model
model User {
  // ... existing fields ...
  templates   Template[]
}
```

### API Endpoints

```typescript
GET    /api/content/templates              // List templates
POST   /api/content/templates              // Create template
GET    /api/content/templates/[id]         // Get specific template
PATCH  /api/content/templates/[id]         // Update template
DELETE /api/content/templates/[id]         // Delete template
```

---

## Success Criteria

M10 is complete when:

- [ ] Comments system works (add, resolve, delete)
- [ ] Track changes works (suggest, accept, reject)
- [ ] Enhanced callouts render correctly
- [ ] Template system functional (create, insert, variables)
- [ ] Enhanced tables (sorting, styling)
- [ ] Link previews display Open Graph data
- [ ] Content extraction API returns structured data
- [ ] Plugin system allows third-party extensions
- [ ] Performance optimizations handle 10K+ word documents
- [ ] All extensions tested with TipTap 3.15+
- [ ] Documentation complete

---

## Dependencies

### NPM Packages

```bash
npm install @tiptap/extension-collaboration @tiptap/extension-collaboration-cursor
```

**No new major dependencies** - builds on existing TipTap!

---

## Timeline

**Week 1 (Phase 1):**
- Days 1-2: Comments extension + UI
- Days 3-4: Track changes + UI
- Day 5: Enhanced callout + custom nodes

**Week 2 (Phase 2):**
- Days 1-2: Template system + database
- Days 3-4: Enhanced tables + link previews
- Day 5: Testing + bug fixes

**Week 3 (Phase 3):**
- Days 1-2: Content extraction API
- Days 3-4: Plugin system + performance
- Day 5: Documentation + examples

**Total: 15 working days (3 weeks)**

---

## Documentation Deliverables

**To Create:**
1. M10-ADVANCED-EDITOR-IMPLEMENTATION.md - Implementation guide
2. EDITOR-PLUGIN-API.md - Plugin development docs
3. CONTENT-EXTRACTION-API.md - AI integration guide
4. TEMPLATE-SYSTEM-GUIDE.md - Template creation guide

**To Update:**
- IMPLEMENTATION-STATUS.md (mark M10 complete)
- CLAUDE.md (add editor features section)

---

## Key Insights

`★ Insight ─────────────────────────────────────`
**Why This Matters:**
1. **Foundation for AI** - Structured extraction gives AI better context
2. **Power user features** - Comments, suggestions, templates unlock workflows
3. **Extensibility** - Plugin system future-proofs for community extensions
4. **Performance** - Large documents work smoothly (10K+ words)
5. **Clean architecture** - Enables collaboration, AI, and more
`─────────────────────────────────────────────────`

---

**End of M10 Specification** 🚀

**Next:** M11 (AI Chat Integration) builds on this foundation!
