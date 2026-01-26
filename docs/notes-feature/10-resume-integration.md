# Resume Integration

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Overview

The existing resume feature provides valuable infrastructure that the notes feature can leverage and extend.

## Existing Resume Infrastructure

### PDF Generation Pipeline (Puppeteer)

**Current Implementation:**
- **Location:** `apps/web/app/api/resume/export-pdf/route.ts`
- **Method:** HTML template → Puppeteer → PDF
- **Features:** Server-side rendering, custom page sizes, ATS-friendly output

```typescript
// Existing pattern from resume feature
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
const pdf = await page.pdf({
  format: 'A4',
  margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
  printBackground: false,
});
await browser.close();
```

### State Persistence Pattern

**Current Implementation:**
- **Location:** `apps/web/app/resume/page.tsx`
- **Method:** useState + useEffect + localStorage
- **Features:** Filter state, section visibility, variant selection

```typescript
// Reusable pattern from resume
const [filterState, setFilterState] = useState<FilterState>(getInitialFilterState);

useEffect(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filterState));
  } catch (error) {
    console.error('Failed to save filter state:', error);
  }
}, [filterState]);
```

## Notes Feature Extensions

### PDF Viewing (New)

Unlike the resume feature (which only generates PDFs), notes needs viewing capability:

**Recommended Library:** `@react-pdf-viewer/core`

```typescript
// New component for notes feature
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

export function NotePDFViewer({ url }: { url: string }) {
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  
  return (
    <Worker workerUrl="/pdf.worker.min.js">
      <Viewer
        fileUrl={url}
        plugins={[defaultLayoutPluginInstance]}
      />
    </Worker>
  );
}
```

### Shared PDF Utilities

Create shared utilities for both features:

```typescript
// lib/pdf/utils.ts

/**
 * Generate PDF from HTML using Puppeteer
 * Used by: Resume export, Note export, Document printing
 */
export async function htmlToPDF(
  html: string, 
  options: PDFOptions = {}
): Promise<Buffer> {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: options.pageSize || 'A4',
      margin: options.margins || {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
      },
      printBackground: options.includeBackground ?? false,
    });
    
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

/**
 * Extract text from PDF
 * Used by: Search indexing, content analysis
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item: any) => item.str).join(' ');
  }
  
  return text;
}
```

## Future: Admin-Editable Resumes

The resume builder will become editable for admins, establishing patterns for collaborative editing:

### Planned Architecture

```typescript
// Future: Admin can edit any user's resume
interface ResumeEditSession {
  resumeId: string;
  userId: string; // Resume owner
  editorId: string; // Admin editing
  changes: ResumeChange[];
  status: 'draft' | 'review' | 'approved';
}

// This pattern will inform notes collaborative editing
interface NoteEditSession {
  noteId: string;
  ownerId: string;
  collaborators: Collaborator[];
  version: number;
}
```

### Shared Editing Components

```typescript
// components/shared/EditingToolbar.tsx
export function EditingToolbar({ 
  onSave, 
  onDiscard, 
  hasUnsavedChanges,
  saveStatus 
}: EditingToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      <Button onClick={onSave} disabled={!hasUnsavedChanges}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
      <SaveStatus status={saveStatus} />
    </div>
  );
}
```

## Migration Considerations

### Resume Feature Upgrades

When implementing notes PDF viewing, optionally upgrade resume feature:

**Option 1: Keep Current (Generate-Only)**
- Resume continues to only generate PDFs for download
- No changes needed

**Option 2: Add Preview (Recommended)**
- Add PDF preview before download
- Reuse `NotePDFViewer` component
- Improve user experience

```typescript
// In resume page, add preview option
<PDFExportButton 
  onExport={handleExport}
  onPreview={handlePreview} // New
/>

{showPreview && (
  <Dialog>
    <NotePDFViewer url={previewUrl} />
  </Dialog>
)}
```

## Shared Data Models

Both features can share:

```typescript
// types/documents.ts
export type DocumentFormat = 'markdown' | 'html' | 'pdf' | 'docx';

export interface ExportOptions {
  format: DocumentFormat;
  includeMetadata: boolean;
  template?: string;
  pageSize?: 'A4' | 'Letter';
}

export interface DocumentExporter {
  export(content: unknown, options: ExportOptions): Promise<Blob>;
}
```

## API Route Consolidation

### Shared Export Endpoint

```typescript
// app/api/export/route.ts
export async function POST(req: Request) {
  const { documentId, format, options } = await req.json();
  
  // Works for both resumes and notes
  const document = await getDocument(documentId);
  const html = await generateHTML(document, options);
  
  if (format === 'pdf') {
    const pdf = await htmlToPDF(html, options);
    return new Response(pdf, {
      headers: { 'Content-Type': 'application/pdf' },
    });
  }
  
  // Other formats...
}
```

## Performance Optimization

### Shared PDF Worker

Both features can use the same PDF.js worker:

```typescript
// public/pdf.worker.js (loaded once)
importScripts('https://unpkg.com/pdfjs-dist@3.x/build/pdf.worker.min.js');

// Used by both resume preview and note PDF viewing
```

## Testing Strategy

Shared tests for common functionality:

```typescript
// tests/pdf-generation.test.ts
describe('PDF Generation (Shared)', () => {
  it('generates PDF from HTML', async () => {
    const html = '<h1>Test</h1>';
    const pdf = await htmlToPDF(html);
    expect(pdf).toBeInstanceOf(Buffer);
  });
  
  it('extracts text from PDF', async () => {
    const text = await extractTextFromPDF(samplePDF);
    expect(text).toContain('expected content');
  });
});
```

## Next Steps

1. Review [Technology Stack](./02-technology-stack.md) for PDF library choice
2. See [File Storage](./07-file-storage.md) for PDF storage patterns
3. Check [Content Types](./08-content-types.md) for PDF viewing implementation
4. Follow [Implementation Guide](./11-implementation-guide.md) for integration steps

