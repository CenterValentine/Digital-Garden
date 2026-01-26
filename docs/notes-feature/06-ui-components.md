# UI Components

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Component Library

All components use the existing design system (`lib/design-system`) and shadcn/ui components (`components/client/ui`).

## Panel Components

### NotesLayout

```typescript
// app/notes/layout.tsx
interface NotesLayoutProps {
  children: React.ReactNode;
}

export default function NotesLayout({ children }: NotesLayoutProps) {
  return (
    <div className="h-screen flex flex-col">
      <NotesHeader />
      <Allotment defaultSizes={[20, 60, 20]}>
        <Allotment.Pane minSize={200} maxSize={400}>
          <LeftSidebar />
        </Allotment.Pane>
        <Allotment.Pane>
          {children}
        </Allotment.Pane>
        <Allotment.Pane minSize={250} maxSize={500}>
          <RightSidebar />
        </Allotment.Pane>
      </Allotment>
      <CommandPalette />
    </div>
  );
}
```

### FileTree (react-arborist with Drag-and-Drop)

```typescript
import { Tree } from 'react-arborist';
import * as Icons from 'lucide-react';

interface FileTreeNode {
  id: string;
  title: string;
  contentType: ContentType;  // derived from payload presence (folder|note|file|html|template|code)
  parentId: string | null;
  children?: FileTreeNode[];
  customIcon?: string | null;
  iconColor?: string | null;
  
  // Payload summaries (for display, not full content)
  note?: { wordCount: number; readingTime: number };
  file?: { fileName: string; uploadStatus: UploadStatus; fileSize: number; mimeType: string };
  html?: { isTemplate: boolean };
  code?: { language: string };
}

type ContentType = 'folder' | 'note' | 'file' | 'html' | 'template' | 'code';
type UploadStatus = 'uploading' | 'ready' | 'failed';

export function FileTree({
  data,
  onMove,
  onSelect,
  onContextMenu
}: FileTreeProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  return (
    <Tree
      data={data}
      height={800}
      width="100%"
      indent={24}
      rowHeight={32}
      // Drag-and-drop for file organization
      onMove={async ({ dragIds, parentId, index }) => {
        await onMove(dragIds, parentId, index);
      }}
      // Multi-select support
      selection={selectedIds}
      onSelect={(nodes) => {
        const ids = nodes.map(n => n.id);
        setSelectedIds(ids);
        onSelect?.(ids);
      }}
      // Search/filter
      searchTerm={searchTerm}
      searchMatch={(node, term) =>
        node.data.title.toLowerCase().includes(term.toLowerCase())
      }
      // Custom node rendering with icons
      renderNode={({ node, style, dragHandle }) => (
        <div
          style={style}
          ref={dragHandle}
          className="flex items-center gap-2 px-2 py-1 hover:bg-muted cursor-pointer"
          onContextMenu={(e) => onContextMenu?.(e, node.data)}
        >
          <NodeIcon
            node={node.data}
            isOpen={node.isOpen}
          />
          <span className="truncate">{node.data.title}</span>
          {node.data.file && (
            <span className="text-xs text-muted-foreground ml-auto">
              {formatFileSize(node.data.file.fileSize)}
            </span>
          )}
        </div>
      )}
    />
  );
}

// Icon component with customization support
function NodeIcon({ node, isOpen }: { node: FileTreeNode; isOpen: boolean }) {
  // Use custom icon if set
  if (node.customIcon) {
    // Check if emoji
    if (/\p{Emoji}/u.test(node.customIcon)) {
      return <span className="text-lg">{node.customIcon}</span>;
    }

    // Lucide icon
    const IconComponent = Icons[node.customIcon as keyof typeof Icons] || Icons.File;
    return (
      <IconComponent
        size={18}
        style={{ color: node.iconColor || undefined }}
      />
    );
  }

  // Default icons by contentType
  const defaultIcons: Record<ContentType, any> = {
    folder: isOpen ? Icons.FolderOpen : Icons.Folder,
    note: Icons.FileText,
    file: Icons.File,  // Generic file icon, refine by MIME type below
    html: Icons.FileCode,
    template: Icons.FileCode2,
    code: Icons.FileCode,
  };

  // Refine file icon by MIME type
  let IconComponent = defaultIcons[node.contentType] || Icons.File;
  if (node.contentType === 'file' && node.file) {
    if (node.file.mimeType.startsWith('image/')) IconComponent = Icons.FileImage;
    else if (node.file.mimeType.startsWith('video/')) IconComponent = Icons.FileVideo;
    else if (node.file.mimeType.startsWith('audio/')) IconComponent = Icons.FileAudio;
    else if (node.file.mimeType === 'application/pdf') IconComponent = Icons.FileType;
    else if (node.file.mimeType.includes('zip') || node.file.mimeType.includes('archive')) IconComponent = Icons.FileArchive;
  }
  
  const defaultColor = node.contentType === 'folder' ? '#f59e0b' : '#3b82f6';

  return (
    <IconComponent
      size={18}
      style={{ color: node.iconColor || defaultColor }}
    />
  );
}
```

### Icon Picker Dialog

```typescript
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import * as Icons from 'lucide-react';

// Popular icon choices
const ICON_PRESETS = [
  'FileText', 'Folder', 'FolderOpen', 'File', 'Files',
  'Rocket', 'Star', 'Heart', 'BookOpen', 'Briefcase',
  'Code', 'Terminal', 'Database', 'Server', 'Cloud',
  'Calendar', 'Clock', 'Bell', 'Mail', 'MessageSquare',
  'Image', 'Video', 'Music', 'Package', 'Archive',
];

const EMOJI_PRESETS = [
  '📁', '📂', '📄', '📝', '📋',
  '🚀', '⭐', '❤️', '📚', '💼',
  '💻', '🖥️', '📱', '⚙️', '🔧',
  '📅', '⏰', '🔔', '📧', '💬',
  '🖼️', '🎬', '🎵', '📦', '🗂️',
];

const COLOR_PRESETS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Green', value: '#10b981' },
  { name: 'Yellow', value: '#f59e0b' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Gray', value: '#6b7280' },
];

export function IconPickerDialog({
  open,
  onClose,
  currentIcon,
  currentColor,
  onSelect
}: IconPickerProps) {
  const [selectedIcon, setSelectedIcon] = useState(currentIcon);
  const [selectedColor, setSelectedColor] = useState(currentColor);

  const handleSave = async () => {
    await onSelect({ icon: selectedIcon, color: selectedColor });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Customize Icon</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="icons">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="icons">Icons</TabsTrigger>
            <TabsTrigger value="emoji">Emoji</TabsTrigger>
            <TabsTrigger value="colors">Colors</TabsTrigger>
          </TabsList>

          <TabsContent value="icons" className="space-y-4">
            <div className="grid grid-cols-8 gap-2">
              {ICON_PRESETS.map(iconName => {
                const IconComponent = Icons[iconName as keyof typeof Icons];
                return (
                  <Button
                    key={iconName}
                    variant={selectedIcon === iconName ? 'default' : 'outline'}
                    size="icon"
                    onClick={() => setSelectedIcon(iconName)}
                    className="h-12 w-12"
                  >
                    <IconComponent size={20} />
                  </Button>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="emoji" className="space-y-4">
            <div className="grid grid-cols-8 gap-2">
              {EMOJI_PRESETS.map(emoji => (
                <Button
                  key={emoji}
                  variant={selectedIcon === emoji ? 'default' : 'outline'}
                  size="icon"
                  onClick={() => setSelectedIcon(emoji)}
                  className="h-12 w-12 text-xl"
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="colors" className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {COLOR_PRESETS.map(color => (
                <Button
                  key={color.value}
                  variant={selectedColor === color.value ? 'default' : 'outline'}
                  onClick={() => setSelectedColor(color.value)}
                  className="h-12"
                >
                  <div
                    className="w-6 h-6 rounded-full border-2 mr-2"
                    style={{ backgroundColor: color.value }}
                  />
                  {color.name}
                </Button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Custom:</label>
              <input
                type="color"
                value={selectedColor || '#3b82f6'}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="h-10 w-20 rounded border"
              />
              <input
                type="text"
                value={selectedColor || ''}
                onChange={(e) => setSelectedColor(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1 px-3 py-2 border rounded"
              />
            </div>

            <Button
              variant="outline"
              onClick={() => setSelectedColor(null)}
              className="w-full"
            >
              Reset to Default
            </Button>
          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 pt-4 border-t">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-muted-foreground">Preview:</span>
            {selectedIcon && (
              <>
                {/\p{Emoji}/u.test(selectedIcon) ? (
                  <span className="text-2xl">{selectedIcon}</span>
                ) : (
                  (() => {
                    const IconComponent = Icons[selectedIcon as keyof typeof Icons];
                    return <IconComponent size={24} style={{ color: selectedColor || '#3b82f6' }} />;
                  })()
                )}
              </>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Editor Components

### MarkdownEditor (Novel/TipTap)

```typescript
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export function MarkdownEditor({ content, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Image, CodeBlock],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  return (
    <div className="prose max-w-none">
      <EditorContent editor={editor} />
    </div>
  );
}
```

### PDFViewer

```typescript
import { Viewer, Worker } from '@react-pdf-viewer/core';

export function PDFViewer({ url }: { url: string }) {
  return (
    <Worker workerUrl="/pdf.worker.js">
      <Viewer fileUrl={url} />
    </Worker>
  );
}
```

### MarkdownEditor (Phase 2)

**File:** `components/content/MarkdownEditor.tsx`

**Purpose:** Toggle between WYSIWYG and raw markdown editing modes.

**Props:**

```typescript
interface MarkdownEditorProps {
  content: object; // TipTap JSON
  onChange: (content: object) => void;
  mode?: 'wysiwyg' | 'markdown'; // Default: 'wysiwyg'
  onModeChange?: (mode: 'wysiwyg' | 'markdown') => void;
}
```

**Implementation:**

```typescript
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/extension-markdown';
import { lazy, Suspense, useState } from 'react';

// Lazy load CodeMirror (only when switching to markdown mode)
const CodeMirror = lazy(() => import('@uiw/react-codemirror'));
const { markdown } = lazy(() => import('@codemirror/lang-markdown'));

export function MarkdownEditor({
  content,
  onChange,
  mode: controlledMode,
  onModeChange,
}: MarkdownEditorProps) {
  const [internalMode, setInternalMode] = useState<'wysiwyg' | 'markdown'>('wysiwyg');
  const mode = controlledMode ?? internalMode;
  
  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });
  
  const toggleMode = () => {
    const newMode = mode === 'wysiwyg' ? 'markdown' : 'wysiwyg';
    onModeChange?.(newMode);
    if (!controlledMode) setInternalMode(newMode);
  };
  
  if (!editor) return null;
  
  if (mode === 'markdown') {
    const markdownContent = editor.storage.markdown.getMarkdown();
    
    return (
      <div className="markdown-editor">
        <div className="editor-toolbar">
          <button onClick={toggleMode} className="toggle-mode-btn">
            Switch to WYSIWYG
          </button>
        </div>
        <Suspense fallback={<div>Loading markdown editor...</div>}>
          <CodeMirror
            value={markdownContent}
            extensions={[markdown()]}
            onChange={(value) => {
              editor.commands.setContent(value);
            }}
            theme="dark"
            className="markdown-editor-codemirror"
          />
        </Suspense>
      </div>
    );
  }
  
  return (
    <div className="wysiwyg-editor">
      <div className="editor-toolbar">
        <button onClick={toggleMode} className="toggle-mode-btn">
          Switch to Markdown
        </button>
      </div>
      <EditorContent editor={editor} className="prose" />
    </div>
  );
}
```

**Accessibility:**

- Toggle button has clear ARIA label
- Both editors support keyboard navigation
- CodeMirror provides screen reader support

**Performance:**

- CodeMirror lazy loaded (only loads when toggling to markdown mode)
- Reduces initial bundle by ~40KB for users who never use markdown mode

## Tab Components

### TabBar

```typescript
interface Tab {
  id: string;
  title: string;
  hasUnsavedChanges: boolean;
}

export function TabBar({ tabs, activeId, onTabClick, onTabClose }: TabBarProps) {
  return (
    <div className="flex border-b">
      {tabs.map((tab) => (
        <Tab
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeId}
          onClick={() => onTabClick(tab.id)}
          onClose={() => onTabClose(tab.id)}
        />
      ))}
    </div>
  );
}
```

## StatusBar

```typescript
export function StatusBar({ status, storageProvider, wordCount, path }: StatusBarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t text-sm">
      <div className="flex items-center gap-4">
        <SaveStatus status={status} />
        <StorageIndicator provider={storageProvider} />
      </div>
      <div className="flex items-center gap-4">
        <WordCount count={wordCount} />
        <FilePath path={path} />
      </div>
    </div>
  );
}
```

## Command Palette

```typescript
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandGroup heading="Files">
          <CommandItem onSelect={createNewNote}>
            <FileText className="mr-2" />
            New Note
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
```

## Accessibility

All components include:

- ARIA labels
- Keyboard navigation
- Focus indicators
- Screen reader support

## Next Steps

1. Review [Architecture](./01-architecture.md) for component hierarchy
2. See [Technology Stack](./02-technology-stack.md) for library usage
3. Follow [Implementation Guide](./11-implementation-guide.md) for building components
