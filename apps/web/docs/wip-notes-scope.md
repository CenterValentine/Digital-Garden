I want to build out a new feature below on @apps/web/app/notes/
This new feature will be an multi-content Obsidian-inspired IDE UI with panel-based layout including:

- Resizable sidebars (file tree navigation)
- Tab-based document interface (with document title, close "x")
- Command palette (keyboard shortcuts)
- sidebar (backlinks, outline, metadata)
- sideChatBar- UI only (AI chat conversations with ANY model of choice, UI only for this project but this will integrate with a separate chat engine)
- statusbar (system states: last saved, file storage vendor, word count, file tree path)
- Extensive hybrid file system where markdown notes and actual files coexist in the same navigation tree which support the following content types:
  - **Markdown notes** (primary content )
  - **Office documents** (PDF, Word, Excel)
  - **Media files** (images, video, audio)
  - Static HTML pages that are tailwind supported.
  - **Code files** (with syntax highlighting)
  - **Diagrams** (Mermaid, Excalidraw)
  - Archives and more
- A robust state of the art markdown content viewer/editor using WYSIWYG editing supporting all Novel/TipTap features.
- Clean maintainable architecture that supports decoration by the current design system.

Justify or condemn the following libraries to impliment the features above:

- Panel related libraries: react-mosaic-component, react-grid-layout, allotment, flexlayout-react, kbar or cmdk. Consider any of their shortcomings of each and replace or add additional or more suitable libraries if they exist
- Content viewing libraries: `react-pdf`, `@react-pdf-viewer/core`, Microsoft Office Online Viewer API?, `react-spreadsheet`, `handsontable`, `react-markdown`, `@uiw/react-md-editor`, `react-syntax-highlighter`, `prism-react-renderer`, @nteract/notebook-render, react-image-gallery, `mermaid`, `react-mermaid2`, @excalidraw/excalidraw, `@react-three/fiber`, `@react-three/drei`,`epubjs`, `react-reader`, PDF: react-pdf or @react-pdf-viewer/core, Office Docs: @microsoft/office-js

## Hybrid content: creation, reading, updating (editing), and viewing:

### Core features:

- View (Read) all supported content types except archive.
  - Works all code types.
- Create and Update on all **document** content types (except pdf).
- Delete on all document types.
- Settings: Justify any recommended settings for hybrid content:
- Special image/video handling logic
- Extensibility for more or other file types.

Document any constraints of implementing any of the recommended libraries for our stated purpose. Justify each each implementation or rejection of a library. Replace or add additional or more suitable libraries if they exist with justification.

### Settings

Outline settings used to manage content libraries with consideration of the command pallet

- content type settings
- Admin/owner decides what user type is allowed to view content. Admin/owner always have this privilege.

### Content storage solutions:

This application will support CRUD from all of the following storage solutions. In settings the storage default for new files can be updated on the mime type level. A small icon on statusbar at the bottom of the viewport based on the storage solution that the document is saved to:

1. Cloudflare R2 (default)
2. AWS S3
3. Vercel Blob

Clearly research to understand necessary data needed to configure each of these, especially cloudflare.

## Markdown content:

### Novel/TipTap

Because Novel appears to be well supported and is rich for representing data via markdown translation, Novel/TipTap combination will be implemented with markdown.

Novel needs to be integrated neatly into our system which will require some updates to the database design.

## Architecture considerations:

The following layout architecture should work in notes. This can ignore the existing navigation layout for the website (for now) but provide the logo component in a corner so navigation can return to the home page:

```
app/
notes/
layout.tsx ← Obsidian-like shell
├─ <Sidebar /> ← File tree navigation
├─ <MainPanel />
│ ├─ <TabBar /> ← Open documents
│ └─ <EditorPane /> ← Markdown editor
├─ <RightSidebar /> ← Backlinks, outline
├─ <SideChatBar />  ← Ai Chat conversations, UI only atm.
└─ <CommandPalette />
└─ <StatusBar /> ← Status
```

#### Filetree example

```
// File tree showing both notes and files, use icons instead emojis.
<FileTree>
📁 Projects/
📝 Project Overview.md
📄 Budget.xlsx
📊 Analysis.pdf
📁 Code/
<> digital-garden.jsx
<> types.tsx
<> util.js
<> pythonScript.py
<> hasher.cpp
📁 Research/
📝 Notes.md
🖼️ diagram.png
📁🖼️ Gallery/
🖼️ birthday.jpg
🖼️ mteveresthike.jpeg
🖼️ familyouting.jpg
🖼️ familyouting.heic
</FileTree>

// File preview panel
<FileViewer docType={doc.docType}>
{docType === 'Note' && <MarkdownEditor />}
{docType === 'PDF' && <PDFViewer />}
{docType === 'Image' && <ImageViewer />}
{docType === 'Doc' && <DocPreview />}
</FileViewer>
```

Nesting is supported using industry practice. See @database document for path and parent child data.

## Additional resources for planning and build design or other considerations.

The following open-source projects could be helpful in building, consider referencing them:
SiYuan (open source) - Has web version, TypeScript/React
Trilium Notes - Web-based, has similar UI patterns
AppFlowy (Flutter but has web version)
AFFiNE - Open source, Notion-like but with Obsidian features

## API Routes for Upload:

Outline all API routes, payloads, etc for ALL CRUD operations for content
Outline all API routes, payloads, etc for ALL CRUD operations for markdown functionality.

## Security:

How is this feature secure so that someone does not create and account and delete or view content that is private, public or that was not generated by them?

## Other considerations:

Do not use emojis. State of the art icon libraries only.

## Database Reconfig

This feature naturally requires an update to the existing database and its core philosophy. Lets recycle the existing database structure without breaking the home page tree node philosophy and design. We'll have to update that design possibly if we make significant changes. Identify all dependencies in this regard and then reimagine the database to work with a content documenting the original design philosophy of the database and provide the updated philosophy based on this feature.

The database adapts , possibly as outlined in @apps/web/prisma/prismaExample.md

- Documents can be private (visible by the user only) but all are public by default.
- File management using cloudflare R2.

Outline potential conflicts that can exist with video, image or code content storage with the existing database

Note any conflicts that can occur in the file database structure for nested image/videos and provide a solution to this.
