# Content Types

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Supported Content Types

### CRUD Capability Matrix

| Type | MIME Type | Create | Read | Update | Delete | Notes |
|------|-----------|--------|------|--------|--------|-------|
| **Markdown** | text/markdown | ✅ | ✅ | ✅ | ✅ | Full WYSIWYG editing |
| **Text** | text/plain | ✅ | ✅ | ✅ | ✅ | Plain text editor |
| **Code** | text/* | ✅ | ✅ | ✅ | ✅ | Syntax highlighting |
| **PDF** | application/pdf | ✅ | ✅ | ❌ | ✅ | View only (no editing) |
| **Word** | application/msword | ✅ | ⚠️ | ❌ | ✅ | Preview via Office Online |
| **Excel** | application/vnd.ms-excel | ✅ | ⚠️ | ❌ | ✅ | Preview via Office Online |
| **Image** | image/* | ✅ | ✅ | ⚠️ | ✅ | View, basic crop/resize |
| **Video** | video/* | ✅ | ✅ | ❌ | ✅ | HTML5 player |
| **Audio** | audio/* | ✅ | ✅ | ❌ | ✅ | HTML5 player |
| **Archive** | application/zip | ✅ | ⚠️ | ❌ | ✅ | List contents only |

✅ Fully supported | ⚠️ Partial support | ❌ Not supported

## File Type Detection

```typescript
// lib/content-types/detect.ts
import { fileTypeFromBuffer } from 'file-type';

export async function detectFileType(buffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const fileType = await fileTypeFromBuffer(uint8Array);
  return fileType?.mime || 'application/octet-stream';
}

export function getIconForMimeType(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return FileImage;
  if (mimeType.startsWith('video/')) return FileVideo;
  if (mimeType.startsWith('audio/')) return FileAudio;
  if (mimeType === 'application/pdf') return FileText;
  if (mimeType.startsWith('text/')) return FileCode;
  if (mimeType.includes('zip')) return FileArchive;
  return File;
}
```

## Viewer Components

### Markdown Viewer
```typescript
import { EditorContent, useEditor } from '@tiptap/react';

export function MarkdownViewer({ content }: { content: TipTapJSON }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    editable: false, // Read-only mode
  });
  
  return <EditorContent editor={editor} className="prose" />;
}
```

### Image Viewer
```typescript
export function ImageViewer({ url }: { url: string }) {
  return (
    <div className="relative w-full h-full">
      <Image
        src={url}
        alt="Image"
        fill
        className="object-contain"
        sizes="100vw"
      />
    </div>
  );
}
```

### Video Player
```typescript
export function VideoPlayer({ url }: { url: string }) {
  return (
    <video controls className="w-full max-h-[600px]">
      <source src={url} type="video/mp4" />
      Your browser doesn't support video playback.
    </video>
  );
}
```

## Editor Components

### Code Editor
```typescript
import Editor from '@monaco-editor/react';

export function CodeEditor({ language, value, onChange }: CodeEditorProps) {
  return (
    <Editor
      height="100%"
      language={language}
      value={value}
      onChange={onChange}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
      }}
    />
  );
}
```

## Fallback Handling

```typescript
export function FileViewer({ file }: { file: FileWithMetadata }) {
  const { mimeType, storageUrl } = file.fileMetadata;
  
  // Try specific viewer
  if (mimeType.startsWith('image/')) return <ImageViewer url={storageUrl} />;
  if (mimeType.startsWith('video/')) return <VideoPlayer url={storageUrl} />;
  if (mimeType === 'application/pdf') return <PDFViewer url={storageUrl} />;
  
  // Fallback to download
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <FileIcon className="w-16 h-16 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Preview not available for this file type
      </p>
      <Button asChild>
        <a href={storageUrl} download>
          Download File
        </a>
      </Button>
    </div>
  );
}
```

## Next Steps

1. Review [UI Components](./06-ui-components.md) for viewer implementations
2. See [Technology Stack](./02-technology-stack.md) for editor libraries
3. Check [File Storage](./07-file-storage.md) for file access patterns

