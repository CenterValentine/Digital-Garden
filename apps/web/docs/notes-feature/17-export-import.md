# Export and Import

**Version:** 1.0  
**Last Updated:** January 12, 2026

## Overview

Comprehensive export and import system for notes, allowing users to migrate data, create backups, and share content across platforms.

## Export Formats

### Supported Formats

| Format          | Extension | Single Note | Folder   | Workspace | Use Case              |
| --------------- | --------- | ----------- | -------- | --------- | --------------------- |
| **Markdown**    | `.md`     | ✅          | ✅ (ZIP) | ✅ (ZIP)  | Plain text, universal |
| **HTML**        | `.html`   | ✅          | ✅ (ZIP) | ✅ (ZIP)  | Web publishing        |
| **PDF**         | `.pdf`    | ✅          | ❌       | ❌        | Print, sharing        |
| **JSON**        | `.json`   | ✅          | ✅       | ✅        | Backup, migration     |
| **ZIP Archive** | `.zip`    | N/A         | ✅       | ✅        | Bulk export           |
| **DOCX**        | `.docx`   | ✅          | ❌       | ❌        | Microsoft Word        |

## Export Library Stack

### Chosen Libraries

```json
{
  "file-saver": "^2.0.5", // 2KB - Single file downloads
  "jszip": "^3.10.1", // 55KB - ZIP archive creation
  "papaparse": "^5.4.1", // 27KB - CSV export (optional)
  "html-to-docx": "^1.8.0" // 180KB - DOCX conversion (optional)
}
```

**Note:** PDF generation uses existing Puppeteer infrastructure from resume feature (see [Resume Integration](./10-resume-integration.md)).

### Markdown Conversion Stack

**For TipTap ↔ Markdown:**

- `@tiptap/extension-markdown` - Bidirectional markdown conversion

```json
{
  "@tiptap/extension-markdown": "^2.0.0"
}
```

**Usage in converters:**

```typescript
// lib/converters/markdown.ts
import { generateJSON } from "@tiptap/html";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/extension-markdown";

const extensions = [StarterKit, Markdown];

export function markdownToTiptap(markdown: string): object {
  const json = generateJSON(markdown, extensions);
  return json;
}

export function tiptapToMarkdown(tiptapJson: object): string {
  // Create temporary editor to serialize
  const editor = new Editor({
    extensions,
    content: tiptapJson,
  });

  const markdown = editor.storage.markdown.getMarkdown();
  editor.destroy();

  return markdown;
}

export function tiptapToHTML(tiptapJson: object): string {
  return generateHTML(tiptapJson, extensions);
}
```

## Implementation

### Export Single Note

```typescript
// lib/export/exporters.ts
import { saveAs } from "file-saver";

export type ExportFormat = "markdown" | "html" | "pdf" | "json" | "docx";

export async function exportNote(
  contentId: string,
  format: ExportFormat
): Promise<void> {
  const content = await fetchContent(contentId);

  switch (format) {
    case "markdown":
      // Extract content based on type
      let markdownContent = "";
      if (content.note) {
        markdownContent = tiptapToMarkdown(content.note.tiptapJson);
      } else if (content.html) {
        markdownContent = htmlToMarkdown(content.html.html);
      } else if (content.code) {
        markdownContent = `\`\`\`${content.code.language}\n${content.code.code}\n\`\`\``;
      }

      const blob = new Blob([markdownContent], {
        type: "text/markdown;charset=utf-8",
      });
      saveAs(blob, `${content.title}.md`);
      break;

    case "html":
      let htmlContent = "";
      if (content.note) {
        htmlContent = tiptapToHTML(content.note.tiptapJson);
      } else if (content.html) {
        htmlContent = content.html.html;
      }

      const htmlBlob = new Blob([htmlContent], {
        type: "text/html;charset=utf-8",
      });
      saveAs(htmlBlob, `${content.title}.html`);
      break;

    case "pdf":
      // Use existing Puppeteer infrastructure
      const response = await fetch("/api/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId,
          options: {
            format: "A4",
            margin: { top: "20mm", bottom: "20mm" },
          },
        }),
      });
      const pdfBlob = await response.blob();
      saveAs(pdfBlob, `${content.title}.pdf`);
      break;

    case "json":
      const jsonData = JSON.stringify(doc, null, 2);
      const jsonBlob = new Blob([jsonData], {
        type: "application/json;charset=utf-8",
      });
      saveAs(jsonBlob, `${doc.title}.json`);
      break;

    case "docx":
      // Optional: convert to Word format
      const docx = await convertToDocx(doc);
      saveAs(docx, `${doc.title}.docx`);
      break;
  }
}
```

### Export Folder (Recursive ZIP)

```typescript
import JSZip from "jszip";

export async function exportFolder(
  folderId: string,
  options?: ExportOptions
): Promise<void> {
  const zip = new JSZip();
  const folder = await fetchDocument(folderId);

  // Recursively add documents to ZIP
  async function addToZip(parentId: string, folderPath: string, zip: JSZip) {
    const children = await fetchChildren(parentId);

    for (const child of children) {
      if (child.contentType === "folder") {
        // Recursively add subfolder
        const subFolder = zip.folder(child.title);
        if (subFolder) {
          await addToZip(child.id, `${folderPath}/${child.title}`, subFolder);
        }
      } else if (child.contentType === "note") {
        // Add markdown file (convert TipTap to markdown)
        const fullContent = await fetchContent(child.id);
        const markdown = tiptapToMarkdown(fullContent.note.tiptapJson);
        zip.file(`${child.title}.md`, markdown);

        // Optionally include metadata
        if (options?.includeMetadata) {
          const metadata = {
            id: child.id,
            created: child.createdAt,
            modified: child.updatedAt,
            tags: child.tags,
            customIcon: child.customIcon,
            iconColor: child.iconColor,
          };
          zip.file(
            `${child.title}.meta.json`,
            JSON.stringify(metadata, null, 2)
          );
        }
      } else if (child.contentType === "file") {
        // Add binary file (PDF, image, video, etc.)
        // Must check uploadStatus before download
        if (child.file?.uploadStatus === "ready") {
          const fileBlob = await fetchFileBinary(child.id);
          const fileName = child.file.fileName || `${child.title}`;
          zip.file(fileName, fileBlob);
        }
      } else if (child.contentType === "html") {
        // Add HTML file
        const fullContent = await fetchContent(child.id);
        zip.file(`${child.title}.html`, fullContent.html.html);
      } else if (child.contentType === "code") {
        // Add code file
        const fullContent = await fetchContent(child.id);
        const ext = getFileExtension(fullContent.code.language);
        zip.file(`${child.title}${ext}`, fullContent.code.code);
      }
    }
  }

  await addToZip(folderId, folder.title, zip);

  // Generate ZIP and download
  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  saveAs(zipBlob, `${folder.title}.zip`);
}
```

### Export Entire Workspace

```typescript
export async function exportWorkspace(
  options: WorkspaceExportOptions
): Promise<void> {
  // For large exports (>100MB), use server-side streaming
  if (options.estimatedSize > 100 * 1024 * 1024) {
    return exportWorkspaceServer(options);
  }

  // Client-side export for smaller workspaces
  const zip = new JSZip();
  const rootDocuments = await fetchRootDocuments();

  for (const content of rootDocuments) {
    if (content.contentType === "folder") {
      const folderZip = zip.folder(content.title);
      if (folderZip) {
        await addToZip(content.id, content.title, folderZip);
      }
    } else {
      // Add root-level files
      await addDocumentToZip(zip, doc);
    }
  }

  // Add workspace metadata
  const metadata = {
    exportedAt: new Date().toISOString(),
    version: "1.0",
    totalDocuments: await countDocuments(),
    user: await getCurrentUser(),
  };
  zip.file("workspace.meta.json", JSON.stringify(metadata, null, 2));

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `workspace-${new Date().toISOString()}.zip`);
}

// Server-side streaming for large exports
async function exportWorkspaceServer(
  options: WorkspaceExportOptions
): Promise<void> {
  const response = await fetch("/api/export/workspace", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error("Export failed");
  }

  // Stream download
  const blob = await response.blob();
  saveAs(blob, `workspace-${new Date().toISOString()}.zip`);
}
```

### Server-Side Export API

```typescript
// app/api/export/workspace/route.ts
import { NextRequest, NextResponse } from "next/server";
import archiver from "archiver";
import { requireAuth } from "@/lib/auth/middleware";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes for large exports

export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const options = await request.json();

  // Create archive stream
  const archive = archiver("zip", {
    zlib: { level: 6 }, // Compression level
  });

  // Stream response
  const stream = new ReadableStream({
    async start(controller) {
      // Pipe archive to controller
      archive.on("data", (chunk) => {
        controller.enqueue(chunk);
      });

      archive.on("end", () => {
        controller.close();
      });

      archive.on("error", (err) => {
        controller.error(err);
      });

      // Add files to archive
      const documents = await prisma.structuredDocument.findMany({
        where: { ownerId: session.user.id },
        include: { fileMetadata: true },
      });

      for (const content of documents) {
        const path = await getContentPath(content.id);

        if (content.contentType === "note") {
          const markdown = tiptapToMarkdown(content.note.tiptapJson);
          archive.append(markdown, { name: `${path}.md` });
        } else if (
          content.contentType === "file" &&
          content.file.uploadStatus === "ready"
        ) {
          const fileBuffer = await downloadFromStorage(content.file.storageKey);
          archive.append(fileBuffer, { name: path });
        } else if (content.contentType === "html") {
          archive.append(content.html.html, { name: `${path}.html` });
        } else if (content.contentType === "code") {
          const ext = getFileExtension(content.code.language);
          archive.append(content.code.code, { name: `${path}${ext}` });
        }
      }

      // Finalize archive
      await archive.finalize();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="workspace-${Date.now()}.zip"`,
      "Transfer-Encoding": "chunked",
    },
  });
}
```

### Export Metadata for Migration

```typescript
export async function exportMetadata(): Promise<void> {
  const allDocs = await fetchAllDocuments();

  const metadata = allContent.map((content) => ({
    id: content.id,
    contentType: content.contentType,
    title: content.title,
    slug: content.slug,
    path: content.path,
    parentId: doc.parentId,
    tags: doc.tags,
    customIcon: doc.customIcon,
    iconColor: doc.iconColor,
    created: doc.createdAt,
    modified: doc.updatedAt,
    fileSize: doc.fileMetadata?.fileSize,
    mimeType: doc.fileMetadata?.mimeType,
  }));

  const exportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    totalDocuments: metadata.length,
    documents: metadata,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  saveAs(blob, "metadata.json");
}
```

## Import System

### Import Markdown Files

```typescript
export async function importMarkdownFiles(
  files: File[],
  targetFolderId?: string
): Promise<ImportResult> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const file of files) {
    try {
      const content = await file.text();

      // Extract frontmatter if present
      const { frontmatter, body } = parseFrontmatter(content);

      // Convert markdown to TipTap JSON using markdown extension
      const tiptapJson = markdownToTiptap(body);

      // Create document
      const response = await fetch("/api/notes/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: frontmatter?.title || file.name.replace(".md", ""),
          tiptapJson,
          parentId: targetFolderId,
          // Import custom icon if specified in frontmatter
          customIcon: frontmatter?.icon,
          iconColor: frontmatter?.iconColor,
        }),
      });

      if (response.ok) {
        results.success++;
      } else {
        results.failed++;
        results.errors.push(`Failed to import ${file.name}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Error importing ${file.name}: ${error.message}`);
    }
  }

  return results;
}

// Parse frontmatter from markdown
function parseFrontmatter(content: string) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (match) {
    const frontmatterYaml = match[1];
    const body = match[2];
    const frontmatter = parseYaml(frontmatterYaml);
    return { frontmatter, body };
  }

  return { frontmatter: null, body: content };
}
```

### Import ZIP Archive

```typescript
import JSZip from "jszip";

export async function importZipArchive(
  file: File,
  targetFolderId?: string
): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);
  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  };

  // Create folder structure first
  const folders = new Map<string, string>(); // path -> contentId

  // Process all files
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue; // Skip directories

    try {
      const pathParts = path.split("/");
      const fileName = pathParts.pop()!;
      const folderPath = pathParts.join("/");

      // Ensure folder structure exists
      let parentId = targetFolderId;
      if (folderPath) {
        parentId = await ensureFolderPath(folderPath, targetFolderId, folders);
      }

      // Import file
      if (fileName.endsWith(".md")) {
        const content = await zipEntry.async("text");
        await importMarkdownFile(fileName, content, parentId);
      } else if (fileName.endsWith(".meta.json")) {
        // Skip metadata files (processed with main file)
      } else {
        // Binary file
        const blob = await zipEntry.async("blob");
        await importBinaryFile(fileName, blob, parentId);
      }

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push(`Error importing ${path}: ${error.message}`);
    }
  }

  return results;
}
```

## Command Palette Integration

```typescript
// Register export commands
export const EXPORT_COMMANDS: Command[] = [
  {
    id: "export-note-markdown",
    label: "Export Note as Markdown",
    shortcut: "Cmd+Shift+E",
    action: () => exportNote(activeDocId, "markdown"),
    icon: Download,
    category: "File",
  },
  {
    id: "export-note-pdf",
    label: "Export Note as PDF",
    action: () => exportNote(activeDocId, "pdf"),
    icon: FileDown,
    category: "File",
  },
  {
    id: "export-folder-zip",
    label: "Export Folder as ZIP",
    action: () => exportFolder(activeFolderId),
    icon: Archive,
    category: "File",
  },
  {
    id: "export-workspace",
    label: "Export Entire Workspace",
    action: () => exportWorkspace(),
    icon: PackageOpen,
    category: "File",
  },
  {
    id: "import-markdown",
    label: "Import Markdown Files",
    action: () => openImportDialog("markdown"),
    icon: Upload,
    category: "File",
  },
  {
    id: "import-zip",
    label: "Import ZIP Archive",
    action: () => openImportDialog("zip"),
    icon: Archive,
    category: "File",
  },
];
```

## UI Components

### Export Button Component

```typescript
// components/notes/ExportButton.tsx
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function ExportButton({ contentId }: { contentId: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportNote(contentId, 'markdown')}>
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportNote(contentId, 'html')}>
          HTML (.html)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportNote(contentId, 'pdf')}>
          PDF (.pdf)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportNote(contentId, 'json')}>
          JSON (.json)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

### Import Dialog Component

```typescript
// components/notes/ImportDialog.tsx
import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);

    try {
      const results = await importMarkdownFiles(files);
      toast.success(`Imported ${results.success} files`);
      onClose();
    } catch (error) {
      toast.error('Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Files</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <input
            type="file"
            multiple
            accept=".md,.markdown,.zip"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />

          {files.length > 0 && (
            <div>
              <p className="text-sm text-muted-foreground">
                {files.length} file(s) selected
              </p>
            </div>
          )}

          <Button onClick={handleImport} disabled={files.length === 0 || importing}>
            <Upload className="h-4 w-4 mr-2" />
            {importing ? 'Importing...' : 'Import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Security Considerations

### Export Security

```typescript
// Validate export permissions
export async function validateExportPermissions(
  userId: string,
  contentId: string
): Promise<boolean> {
  const content = await prisma.contentNode.findUnique({
    where: { id: contentId },
    select: { ownerId: true },
  });

  return document?.ownerId === userId;
}

// Rate limiting for exports
export async function checkExportRateLimit(userId: string): Promise<boolean> {
  const key = `export-rate-limit:${userId}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour window
  }

  return count <= 10; // Max 10 exports per hour
}
```

### Import Security

```typescript
// Validate imported files
export async function validateImportFile(
  file: File
): Promise<ValidationResult> {
  // Check file size
  if (file.size > 50 * 1024 * 1024) {
    // 50MB limit
    return { valid: false, error: "File too large" };
  }

  // Check file type
  const allowedTypes = [
    "text/markdown",
    "text/plain",
    "application/zip",
    "application/x-zip-compressed",
  ];

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: "Invalid file type" };
  }

  // For ZIP files, scan for malicious content
  if (file.type.includes("zip")) {
    const isSafe = await scanZipFile(file);
    if (!isSafe) {
      return { valid: false, error: "Potentially dangerous content detected" };
    }
  }

  return { valid: true };
}
```

## Next Steps

1. Review [File Storage](./07-file-storage.md) for storage integration
2. See [API Specification](./04-api-specification.md) for endpoint details
3. Check [UI Components](./06-ui-components.md) for UI integration
4. Follow [Implementation Guide](./11-implementation-guide.md) for setup
