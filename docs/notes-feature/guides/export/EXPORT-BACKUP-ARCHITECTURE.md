# Export & Backup Architecture

**Version:** 1.0
**Date:** 2026-01-26
**Status:** Design Phase

## Overview

Comprehensive export and backup system for Content IDE with multi-format document conversion (TipTap → Markdown, HTML, PDF, DOCX, etc.) and automated backup workflows.

---

## 1. Settings Structure

### New Settings Section: `exportBackup`

```typescript
interface UserSettings {
  // ... existing settings ...

  exportBackup: {
    // Default export format
    defaultFormat: 'markdown' | 'html' | 'pdf' | 'docx' | 'json';

    // Markdown export options
    markdown: {
      includeMetadata: boolean;           // Include .meta.json sidecar
      includeFrontmatter: boolean;        // YAML frontmatter
      preserveSemantics: boolean;         // HTML comments for tags/wikilinks
      wikiLinkStyle: '[[]]' | '[]()';    // Obsidian vs standard
      codeBlockLanguagePrefix: boolean;   // ```js vs ```
    };

    // HTML export options
    html: {
      standalone: boolean;                // Full HTML doc vs fragment
      includeCSS: boolean;                // Embed stylesheet
      theme: 'light' | 'dark' | 'auto';  // Color scheme
      syntaxHighlight: boolean;           // Code block highlighting
    };

    // PDF export options
    pdf: {
      pageSize: 'A4' | 'Letter' | 'Legal';
      margins: { top: number; right: number; bottom: number; left: number };
      headerFooter: boolean;
      includeTableOfContents: boolean;
      colorScheme: 'color' | 'grayscale';
    };

    // Automated backup settings
    autoBackup: {
      enabled: boolean;
      frequency: 'daily' | 'weekly' | 'monthly' | 'manual';
      formats: Array<'markdown' | 'html' | 'json'>;
      storageProvider: 'r2' | 's3' | 'vercel' | 'local';
      includeDeleted: boolean;            // Include trash
      maxBackups: number;                 // Rotation limit
      lastBackupAt: string | null;        // ISO timestamp
    };

    // Bulk export settings
    bulkExport: {
      batchSize: number;                  // Files per batch
      compressionFormat: 'zip' | 'tar.gz' | 'none';
      includeStructure: boolean;          // Preserve folder hierarchy
      fileNaming: 'slug' | 'title' | 'id';
    };
  };
}
```

### Default Settings

```typescript
export const DEFAULT_EXPORT_BACKUP_SETTINGS = {
  defaultFormat: 'markdown',

  markdown: {
    includeMetadata: true,
    includeFrontmatter: true,
    preserveSemantics: true,
    wikiLinkStyle: '[[]]',
    codeBlockLanguagePrefix: true,
  },

  html: {
    standalone: true,
    includeCSS: true,
    theme: 'auto',
    syntaxHighlight: true,
  },

  pdf: {
    pageSize: 'A4',
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    headerFooter: true,
    includeTableOfContents: true,
    colorScheme: 'color',
  },

  autoBackup: {
    enabled: false,
    frequency: 'weekly',
    formats: ['markdown', 'json'],
    storageProvider: 'r2',
    includeDeleted: false,
    maxBackups: 30,
    lastBackupAt: null,
  },

  bulkExport: {
    batchSize: 50,
    compressionFormat: 'zip',
    includeStructure: true,
    fileNaming: 'slug',
  },
};
```

---

## 2. Multi-Format Converter Architecture

### Core Converter Interface

```typescript
// lib/domain/export/types.ts

export interface ConversionOptions {
  format: ExportFormat;
  settings: UserSettings['exportBackup'];
  metadata?: {
    includeMetadata?: boolean;
    customMetadata?: Record<string, unknown>;
  };
}

export type ExportFormat =
  | 'markdown'
  | 'html'
  | 'pdf'
  | 'docx'
  | 'json'
  | 'txt'
  | 'rtf'
  | 'latex';

export interface ConversionResult {
  success: boolean;
  files: Array<{
    name: string;
    content: Buffer | string;
    mimeType: string;
    size: number;
  }>;
  metadata?: {
    conversionTime: number;
    format: ExportFormat;
    warnings?: string[];
  };
}

export interface DocumentConverter {
  convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult>;
}
```

### Converter Factory Pattern

```typescript
// lib/domain/export/factory.ts

import { MarkdownConverter } from './converters/markdown';
import { HTMLConverter } from './converters/html';
import { PDFConverter } from './converters/pdf';
import { DOCXConverter } from './converters/docx';
import { JSONConverter } from './converters/json';
import { PlainTextConverter } from './converters/plaintext';

export function getConverter(format: ExportFormat): DocumentConverter {
  switch (format) {
    case 'markdown':
      return new MarkdownConverter();
    case 'html':
      return new HTMLConverter();
    case 'pdf':
      return new PDFConverter();
    case 'docx':
      return new DOCXConverter();
    case 'json':
      return new JSONConverter();
    case 'txt':
      return new PlainTextConverter();
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

export async function convertDocument(
  tiptapJson: JSONContent,
  options: ConversionOptions
): Promise<ConversionResult> {
  const converter = getConverter(options.format);
  return converter.convert(tiptapJson, options);
}
```

---

## 3. Format-Specific Converters

### 3.1 Markdown Converter (Enhanced)

```typescript
// lib/domain/export/converters/markdown.ts

import { generateHTML } from '@tiptap/core';
import { getServerExtensions } from '@/lib/domain/editor';
import type { DocumentConverter, ConversionOptions, ConversionResult } from '../types';

export class MarkdownConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    const settings = options.settings.markdown;

    // Use proper markdown serialization
    const markdown = await this.tiptapToMarkdown(tiptapJson, settings);

    const files: ConversionResult['files'] = [
      {
        name: 'document.md',
        content: markdown,
        mimeType: 'text/markdown',
        size: Buffer.byteLength(markdown),
      },
    ];

    // Add metadata sidecar if requested
    if (settings.includeMetadata && options.metadata) {
      const metadataJson = JSON.stringify(options.metadata.customMetadata, null, 2);
      files.push({
        name: 'document.meta.json',
        content: metadataJson,
        mimeType: 'application/json',
        size: Buffer.byteLength(metadataJson),
      });
    }

    return {
      success: true,
      files,
      metadata: {
        conversionTime: performance.now() - startTime,
        format: 'markdown',
      },
    };
  }

  private async tiptapToMarkdown(
    json: JSONContent,
    settings: MarkdownSettings
  ): Promise<string> {
    // TODO: Implement proper prosemirror-markdown serializer
    // For now, use custom serializer with extension support

    const lines: string[] = [];

    // Add YAML frontmatter if requested
    if (settings.includeFrontmatter) {
      lines.push('---');
      lines.push(`title: ${json.attrs?.title || 'Untitled'}`);
      lines.push(`created: ${new Date().toISOString()}`);
      lines.push('---');
      lines.push('');
    }

    // Serialize TipTap JSON to Markdown
    const content = this.serializeNode(json, settings);
    lines.push(content);

    return lines.join('\n');
  }

  private serializeNode(node: JSONContent, settings: MarkdownSettings): string {
    // Recursive node serialization with custom extension support
    // This will be expanded to handle all TipTap nodes

    switch (node.type) {
      case 'doc':
        return node.content?.map(n => this.serializeNode(n, settings)).join('\n\n') || '';

      case 'paragraph':
        return node.content?.map(n => this.serializeNode(n, settings)).join('') || '';

      case 'heading':
        const level = node.attrs?.level || 1;
        const text = node.content?.map(n => this.serializeNode(n, settings)).join('') || '';
        return '#'.repeat(level) + ' ' + text;

      case 'text':
        let text = node.text || '';

        // Apply marks
        if (node.marks) {
          for (const mark of node.marks) {
            if (mark.type === 'bold') text = `**${text}**`;
            if (mark.type === 'italic') text = `*${text}*`;
            if (mark.type === 'code') text = `\`${text}\``;
          }
        }

        return text;

      case 'codeBlock':
        const lang = node.attrs?.language || '';
        const code = node.content?.[0]?.text || '';
        const langPrefix = settings.codeBlockLanguagePrefix ? lang : '';
        return `\`\`\`${langPrefix}\n${code}\n\`\`\``;

      case 'bulletList':
        return node.content?.map(n => '- ' + this.serializeNode(n, settings)).join('\n') || '';

      case 'orderedList':
        return node.content?.map((n, i) => `${i + 1}. ` + this.serializeNode(n, settings)).join('\n') || '';

      case 'listItem':
        return node.content?.map(n => this.serializeNode(n, settings)).join('\n') || '';

      case 'blockquote':
        const quoteContent = node.content?.map(n => this.serializeNode(n, settings)).join('\n') || '';
        return quoteContent.split('\n').map(line => `> ${line}`).join('\n');

      case 'wikiLink':
        const target = node.attrs?.targetTitle || '';
        const display = node.attrs?.displayText || '';

        if (settings.wikiLinkStyle === '[[]]') {
          return display ? `[[${target}|${display}]]` : `[[${target}]]`;
        } else {
          return `[${display || target}](${target})`;
        }

      case 'tag':
        const tagName = node.attrs?.tagName || '';
        const tagId = node.attrs?.tagId || '';
        const color = node.attrs?.color || '';

        if (settings.preserveSemantics) {
          // Embed metadata in HTML comment
          return `<!-- tag:${tagId}:${color} -->#${tagName}<!-- /tag -->`;
        } else {
          return `#${tagName}`;
        }

      case 'callout':
        const calloutType = node.attrs?.type || 'note';
        const calloutTitle = node.attrs?.title || '';
        const calloutContent = node.content?.map(n => this.serializeNode(n, settings)).join('\n') || '';

        return `> [!${calloutType}]${calloutTitle ? ' ' + calloutTitle : ''}\n> ${calloutContent}`;

      case 'table':
        // TODO: Implement table markdown serialization
        return '(Table export not yet implemented)';

      default:
        return '';
    }
  }
}
```

### 3.2 HTML Converter

```typescript
// lib/domain/export/converters/html.ts

import { generateHTML } from '@tiptap/core';
import { getServerExtensions } from '@/lib/domain/editor';

export class HTMLConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    const settings = options.settings.html;

    // Generate HTML from TipTap JSON
    const extensions = getServerExtensions();
    const htmlContent = generateHTML(tiptapJson, extensions);

    let finalHTML = htmlContent;

    if (settings.standalone) {
      finalHTML = this.wrapInHTMLDocument(htmlContent, settings);
    }

    return {
      success: true,
      files: [
        {
          name: 'document.html',
          content: finalHTML,
          mimeType: 'text/html',
          size: Buffer.byteLength(finalHTML),
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: 'html',
      },
    };
  }

  private wrapInHTMLDocument(content: string, settings: any): string {
    const theme = settings.theme === 'auto' ? 'light' : settings.theme;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document</title>
  ${settings.includeCSS ? this.getCSS(theme) : ''}
</head>
<body class="${theme}">
  <div class="content-wrapper">
    ${content}
  </div>
</body>
</html>`;
  }

  private getCSS(theme: string): string {
    // Return embedded CSS for document styling
    return `<style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6;
        max-width: 800px;
        margin: 0 auto;
        padding: 2rem;
        background: ${theme === 'dark' ? '#1a1a1a' : '#ffffff'};
        color: ${theme === 'dark' ? '#e0e0e0' : '#1a1a1a'};
      }

      h1, h2, h3, h4, h5, h6 {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }

      code {
        background: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};
        padding: 0.2em 0.4em;
        border-radius: 3px;
        font-family: 'Courier New', monospace;
      }

      pre {
        background: ${theme === 'dark' ? '#2a2a2a' : '#f5f5f5'};
        padding: 1em;
        border-radius: 5px;
        overflow-x: auto;
      }

      blockquote {
        border-left: 4px solid ${theme === 'dark' ? '#555' : '#ddd'};
        margin-left: 0;
        padding-left: 1em;
        color: ${theme === 'dark' ? '#aaa' : '#666'};
      }

      .wiki-link {
        color: #3b82f6;
        text-decoration: underline;
      }

      .tag-node {
        display: inline-flex;
        align-items: center;
        padding: 0.125rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .callout {
        padding: 1em;
        border-left: 4px solid;
        margin: 1em 0;
        border-radius: 4px;
      }

      .callout-note { border-color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
      .callout-warning { border-color: #f59e0b; background: rgba(245, 158, 11, 0.1); }
      .callout-danger { border-color: #ef4444; background: rgba(239, 68, 68, 0.1); }
    </style>`;
  }
}
```

### 3.3 PDF Converter

```typescript
// lib/domain/export/converters/pdf.ts

// Uses puppeteer or jsPDF for PDF generation
import puppeteer from 'puppeteer';

export class PDFConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();
    const settings = options.settings.pdf;

    // First convert to HTML
    const htmlConverter = new HTMLConverter();
    const htmlResult = await htmlConverter.convert(tiptapJson, {
      ...options,
      format: 'html',
    });

    const html = htmlResult.files[0].content as string;

    // Launch headless browser
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: settings.pageSize,
        margin: settings.margins,
        printBackground: true,
        displayHeaderFooter: settings.headerFooter,
      });

      return {
        success: true,
        files: [
          {
            name: 'document.pdf',
            content: pdfBuffer,
            mimeType: 'application/pdf',
            size: pdfBuffer.length,
          },
        ],
        metadata: {
          conversionTime: performance.now() - startTime,
          format: 'pdf',
        },
      };
    } finally {
      await browser.close();
    }
  }
}
```

### 3.4 DOCX Converter

```typescript
// lib/domain/export/converters/docx.ts

// Uses docx library for Word document generation
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';

export class DOCXConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();

    // Convert TipTap JSON to docx elements
    const children = this.convertNode(tiptapJson);

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    // Generate buffer
    const buffer = await Packer.toBuffer(doc);

    return {
      success: true,
      files: [
        {
          name: 'document.docx',
          content: buffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: buffer.length,
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: 'docx',
      },
    };
  }

  private convertNode(node: JSONContent): any[] {
    // Recursive conversion to docx elements
    // Implementation details...
  }
}
```

### 3.5 JSON Converter (Lossless)

```typescript
// lib/domain/export/converters/json.ts

export class JSONConverter implements DocumentConverter {
  async convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult> {
    const startTime = performance.now();

    // Pretty-print TipTap JSON
    const jsonString = JSON.stringify(tiptapJson, null, 2);

    return {
      success: true,
      files: [
        {
          name: 'document.json',
          content: jsonString,
          mimeType: 'application/json',
          size: Buffer.byteLength(jsonString),
        },
      ],
      metadata: {
        conversionTime: performance.now() - startTime,
        format: 'json',
      },
    };
  }
}
```

---

## 4. Bulk Export System

### 4.1 Bulk Export Service

```typescript
// lib/domain/export/bulk-export.ts

import JSZip from 'jszip';
import { prisma } from '@/lib/database/client';
import { convertDocument } from './factory';

export interface BulkExportOptions {
  userId: string;
  format: ExportFormat;
  filters?: {
    parentId?: string;
    tags?: string[];
    dateRange?: { start: Date; end: Date };
    includeDeleted?: boolean;
  };
  settings: UserSettings['exportBackup'];
}

export async function exportVault(
  options: BulkExportOptions
): Promise<Buffer> {
  // Fetch all notes matching criteria
  const notes = await prisma.contentNode.findMany({
    where: {
      ownerId: options.userId,
      notePayload: { isNot: null },
      deletedAt: options.filters?.includeDeleted ? undefined : null,
      ...(options.filters?.parentId && { parentId: options.filters.parentId }),
      ...(options.filters?.tags && {
        contentTags: {
          some: {
            tag: { slug: { in: options.filters.tags } },
          },
        },
      }),
    },
    include: {
      notePayload: true,
      contentTags: { include: { tag: true } },
      sourceLinks: { include: { target: true } },
    },
  });

  // Create ZIP archive
  const zip = new JSZip();

  // Process notes in batches
  const batchSize = options.settings.bulkExport.batchSize;

  for (let i = 0; i < notes.length; i += batchSize) {
    const batch = notes.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async (note) => {
        const tiptapJson = note.notePayload!.tiptapJson as JSONContent;

        // Generate metadata
        const metadata = {
          contentId: note.id,
          title: note.title,
          slug: note.slug,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
          tags: note.contentTags.map(ct => ({
            id: ct.tag.id,
            name: ct.tag.name,
            slug: ct.tag.slug,
            color: ct.tag.color,
          })),
          wikiLinks: note.sourceLinks.map(link => ({
            targetId: link.targetId,
            targetTitle: link.target.title,
          })),
        };

        // Convert document
        const result = await convertDocument(tiptapJson, {
          format: options.format,
          settings: options.settings,
          metadata: { customMetadata: metadata },
        });

        // Add files to ZIP
        const folderPath = options.settings.bulkExport.includeStructure
          ? this.buildFolderPath(note)
          : '';

        for (const file of result.files) {
          const fileName = this.getFileName(note, options.settings.bulkExport.fileNaming);
          const extension = file.name.split('.').pop();

          zip.file(
            `${folderPath}${fileName}.${extension}`,
            file.content
          );
        }
      })
    );
  }

  // Generate ZIP buffer
  return await zip.generateAsync({
    type: 'nodebuffer',
    compression: options.settings.bulkExport.compressionFormat === 'zip' ? 'DEFLATE' : 'STORE',
    compressionOptions: { level: 9 },
  });
}

private buildFolderPath(note: ContentNode): string {
  // Recursively build folder path from parent hierarchy
  // Implementation...
}

private getFileName(
  note: ContentNode,
  naming: 'slug' | 'title' | 'id'
): string {
  switch (naming) {
    case 'slug':
      return note.slug;
    case 'title':
      return note.title.replace(/[^a-z0-9]/gi, '-');
    case 'id':
      return note.id;
  }
}
```

---

## 5. API Endpoints

### 5.1 Single Document Export

```typescript
// app/api/content/export/[id]/route.ts

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAuth();
  const { id } = await params;
  const { format, options } = await request.json();

  // Fetch content
  const content = await prisma.contentNode.findUnique({
    where: { id },
    include: {
      notePayload: true,
      contentTags: { include: { tag: true } },
    },
  });

  if (!content || content.ownerId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Get user settings
  const userSettings = await getUserSettings(session.user.id);

  // Convert document
  const result = await convertDocument(
    content.notePayload!.tiptapJson as JSONContent,
    {
      format,
      settings: userSettings.exportBackup,
      metadata: {
        customMetadata: {
          title: content.title,
          tags: content.contentTags.map(ct => ct.tag),
        },
      },
    }
  );

  // Return file
  const file = result.files[0];
  return new Response(file.content, {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${content.slug}.${format}"`,
    },
  });
}
```

### 5.2 Bulk Vault Export

```typescript
// app/api/content/export/vault/route.ts

export async function POST(request: NextRequest) {
  const session = await requireAuth();
  const body = await request.json();

  // Get user settings
  const userSettings = await getUserSettings(session.user.id);

  // Export vault
  const zipBuffer = await exportVault({
    userId: session.user.id,
    format: body.format || userSettings.exportBackup.defaultFormat,
    filters: body.filters,
    settings: userSettings.exportBackup,
  });

  return new Response(zipBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="vault-${Date.now()}.zip"`,
    },
  });
}
```

---

## 6. Settings UI Component

```typescript
// app/(authenticated)/settings/export/page.tsx

export default function ExportSettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Export & Backup</h1>
        <p className="text-gray-400 mt-2">
          Configure export formats and automated backups
        </p>
      </div>

      <Tabs defaultValue="formats">
        <TabsList>
          <TabsTrigger value="formats">Export Formats</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Export</TabsTrigger>
          <TabsTrigger value="backup">Auto Backup</TabsTrigger>
        </TabsList>

        <TabsContent value="formats">
          <FormatSettingsTab />
        </TabsContent>

        <TabsContent value="bulk">
          <BulkExportTab />
        </TabsContent>

        <TabsContent value="backup">
          <AutoBackupTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 7. Implementation Dependencies

### NPM Packages

```json
{
  "dependencies": {
    "jszip": "^3.10.1",              // ZIP archive generation
    "puppeteer": "^21.7.0",          // PDF generation (headless Chrome)
    "docx": "^8.5.0",                // DOCX generation
    "turndown": "^7.1.2",            // HTML → Markdown (fallback)
    "prosemirror-markdown": "^1.12.0" // Proper markdown serialization
  }
}
```

### Alternative: Lightweight PDF

For serverless environments where Puppeteer is too heavy:

```typescript
// Use jsPDF instead
import { jsPDF } from 'jspdf';

export class LightweightPDFConverter implements DocumentConverter {
  // Convert to plain text, then generate PDF
}
```

---

## 8. Implementation Phases

### Phase 1: Core Converters (Week 1)
- ✅ Markdown converter with proper serialization
- ✅ HTML converter with standalone option
- ✅ JSON converter (lossless)
- ✅ Plain text converter

### Phase 2: Advanced Formats (Week 2)
- PDF converter (Puppeteer or jsPDF)
- DOCX converter (docx library)
- Format-specific settings UI

### Phase 3: Bulk Export (Week 3)
- Bulk export service
- ZIP archive generation
- Folder hierarchy preservation
- Progress tracking

### Phase 4: Auto Backup (Week 4)
- Scheduled backup jobs
- Storage provider integration
- Backup rotation
- Restore functionality

---

## 9. Testing Strategy

### Unit Tests
- Each converter with sample TipTap JSON
- Edge cases: empty documents, complex nesting
- Extension compatibility (wiki-links, tags, callouts)

### Integration Tests
- Bulk export with large vaults (1000+ notes)
- ZIP integrity
- Format conversion round-trips (where possible)

### E2E Tests
- User exports single document
- User exports entire vault
- Automated backup triggers

---

## 10. Security Considerations

### File Size Limits
- Max single file: 100MB
- Max bulk export: 5GB
- Streaming for large exports

### Rate Limiting
- Export API: 10 requests per minute
- Bulk export: 1 request per 5 minutes

### Data Sanitization
- Sanitize file names
- Validate MIME types
- Check for path traversal

---

## 11. Performance Optimization

### Caching
- Cache format conversions for unchanged documents
- Store conversion results in storage bucket
- Invalidate on document update

### Streaming
- Stream large ZIP files directly to response
- Don't load entire vault into memory

### Background Jobs
- Queue large exports
- Email download link when ready
- Show progress in UI

---

## Next Steps

1. **Define Settings UI** - Design export settings page layout
2. **Implement Core Converters** - Start with Markdown, HTML, JSON
3. **Add Export Endpoints** - Single doc + bulk export APIs
4. **Build Settings Panel** - User-facing export configuration
5. **Test & Iterate** - Validate with real-world documents
