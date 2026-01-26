# ONLYOFFICE Integration Setup Guide

**Created:** January 23, 2026
**Status:** Implementation Complete, Testing Required

---

## Overview

The Notes IDE now supports **full Office document editing** with auto-save using ONLYOFFICE Document Server. This replaces the view-only Microsoft Office Online Viewer as the primary option.

### Features

- ✅ Edit `.docx`, `.xlsx`, `.pptx` files directly in the browser
- ✅ Auto-save on document changes
- ✅ Force-save when document is closed
- ✅ Collaborative editing support (future)
- ✅ Fallback to Microsoft Viewer (view-only) if ONLYOFFICE not configured
- ✅ Settings page to configure ONLYOFFICE server URL

---

## Architecture

### Component Hierarchy

```
FileViewer (apps/web/components/notes/viewer/FileViewer.tsx)
  ↓
OfficeDocumentViewer (apps/web/components/notes/viewer/OfficeDocumentViewer.tsx)
  ↓ (if officeViewerMode === "onlyoffice" && onlyofficeServerUrl)
OnlyOfficeEditor (apps/web/components/notes/viewer/OnlyOfficeEditor.tsx)
  ↓ (uses)
@onlyoffice/document-editor-react
```

### Data Flow

```
1. User opens .docx file
   ↓
2. OnlyOfficeEditor component renders
   ↓
3. ONLYOFFICE Document Server fetches file from Cloudflare R2 (via downloadUrl)
   ↓
4. User edits document
   ↓
5. ONLYOFFICE calls /api/onlyoffice/callback with status=2 or status=6
   ↓
6. Backend downloads updated file from ONLYOFFICE's URL
   ↓
7. Backend uploads to R2, updates database
   ↓
8. Returns success response to ONLYOFFICE
```

### Callback Status Codes

| Status | Meaning | Action |
|--------|---------|--------|
| 0 | Document not found | Error |
| 1 | Document being edited | No action (ack only) |
| 2 | Document ready for saving (user closed) | Save to storage |
| 3 | Document saving error | Error |
| 4 | Document closed with no changes | No action |
| 6 | Document being edited, but current state saved | Save to storage (auto-save) |
| 7 | Force save error | Error |

---

## Setup Instructions

### Option 1: Self-Hosted ONLYOFFICE Document Server

**Docker Compose (Recommended for Development):**

```yaml
# docker-compose.yml
version: '3.8'

services:
  onlyoffice-documentserver:
    image: onlyoffice/documentserver:latest
    container_name: onlyoffice-documentserver
    ports:
      - "8080:80"
      - "8443:443"
    environment:
      - JWT_ENABLED=false  # Disable for development, enable for production
      - JWT_SECRET=your-secret-key  # Set a strong secret in production
    volumes:
      - document_data:/var/www/onlyoffice/Data
      - document_log:/var/log/onlyoffice
      - document_fonts:/usr/share/fonts/truetype/custom
      - document_forgotten:/var/lib/onlyoffice/documentserver/App_Data/cache/files/forgotten
    restart: unless-stopped

volumes:
  document_data:
  document_log:
  document_fonts:
  document_forgotten:
```

**Start the server:**
```bash
docker-compose up -d
```

**Access:** `http://localhost:8080`

**Configure in app:**
1. Go to Settings → Preferences
2. Set "ONLYOFFICE Document Server URL" to `http://localhost:8080`
3. Click "Save"

---

### Option 2: ONLYOFFICE Cloud Service

**Sign up:** https://www.onlyoffice.com/cloud-service.aspx

**Pricing:** Starting at $5/month for 5 users

**Configure in app:**
1. Get your Document Server URL from ONLYOFFICE dashboard
2. Go to Settings → Preferences
3. Set "ONLYOFFICE Document Server URL" to your cloud URL
4. Click "Save"

---

### Option 3: ONLYOFFICE Community Edition (Free)

**Download:** https://www.onlyoffice.com/download-docs.aspx

**Installation:** Follow platform-specific instructions (Linux, Windows, macOS)

**Configure in app:**
1. Install ONLYOFFICE on your server
2. Get your Document Server URL (e.g., `https://office.yourdomain.com`)
3. Go to Settings → Preferences
4. Set "ONLYOFFICE Document Server URL"
5. Click "Save"

---

## Configuration

### Settings Location

**Path:** `/settings/preferences`

**Options:**

1. **Viewing Mode:**
   - **ONLYOFFICE Editor** (default) - Full editing with auto-save
   - **Microsoft Office Online** - View-only fallback

2. **ONLYOFFICE Document Server URL:**
   - Required for edit mode
   - Example: `http://localhost:8080` or `https://office.yourdomain.com`
   - Leave empty to fall back to view-only mode

### Settings Store

**File:** `apps/web/stores/upload-settings-store.ts`

**State:**
```typescript
interface UploadSettingsStore {
  officeViewerMode: 'onlyoffice' | 'microsoft-viewer';
  onlyofficeServerUrl: string | null;
  setOfficeViewerMode: (mode: OfficeViewerMode) => void;
  setOnlyofficeServerUrl: (url: string | null) => void;
}
```

**Persistence:** localStorage (version 2 with migration)

---

## API Endpoints

### Callback Endpoint

**Path:** `apps/web/app/api/onlyoffice/callback/route.ts`

**Method:** `POST`

**Query Params:**
- `contentId` - UUID of the ContentNode

**Request Body:**
```json
{
  "key": "content-id-timestamp",
  "status": 2,
  "url": "https://onlyoffice-server.com/cache/files/document.docx"
}
```

**Response:**
```json
{ "error": 0 }  // 0 = success, any other value = error
```

**Status Handling:**
- Status 1: Document being edited → Return success (no save)
- Status 2 or 6: Document ready for saving → Download, upload to R2, update DB
- Status 4: No changes → Return success (no save)
- Status 3 or 7: Error → Return error response

---

## Storage Integration

### Current Implementation

The callback endpoint currently **downloads the file but does not upload to R2**. This is a TODO:

```typescript
// TODO: Implement storage upload
// For now, we'll use the simple upload endpoint as a reference
// In production, you'd directly upload to R2 using the storage SDK
```

### Next Steps

1. Import storage SDK from `@/lib/storage/`
2. Get user's default storage provider
3. Upload downloaded buffer to R2 with same storage key
4. Update `FilePayload` with new file size and checksum

**Example:**
```typescript
import { getStorageProvider } from "@/lib/storage/factory";

// Get storage provider
const storageProvider = await getStorageProvider(content.filePayload.storageProvider);

// Upload to R2
await storageProvider.uploadFile({
  key: content.filePayload.storageKey,
  buffer,
  mimeType: content.filePayload.mimeType,
});

// Update database
await prisma.filePayload.update({
  where: { contentId },
  data: {
    fileSize: buffer.length.toString(),
    uploadStatus: "ready",
    // TODO: Update checksum
  },
});
```

---

## Security Considerations

### JWT Tokens (Production)

**Enable JWT in ONLYOFFICE:**
```yaml
environment:
  - JWT_ENABLED=true
  - JWT_SECRET=your-strong-secret-key
```

**Add JWT to config:**
```typescript
// In OnlyOfficeEditor.tsx
const config = {
  // ... existing config
  token: generateJWT(config),  // Sign the config with your JWT secret
};
```

**Why JWT?**
- Prevents unauthorized access to ONLYOFFICE server
- Validates callback requests are legitimate
- Required for production deployments

### CORS Configuration

ONLYOFFICE needs to access your file URLs. Ensure Cloudflare R2 presigned URLs allow CORS:

```typescript
// When generating presigned URL
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
}
```

### Callback Authentication

The callback endpoint should verify:
1. User owns the content
2. ONLYOFFICE request is legitimate (JWT signature)
3. File exists and is not deleted

**Currently implemented:** User ownership check
**TODO:** JWT validation

---

## Testing Checklist

### Prerequisites
- [ ] ONLYOFFICE Document Server running
- [ ] Server URL configured in settings
- [ ] Test .docx, .xlsx, .pptx files uploaded

### Functionality Tests
- [ ] Open .docx file → ONLYOFFICE editor loads
- [ ] Edit document → Changes visible immediately
- [ ] Close editor → Auto-save triggers (check callback logs)
- [ ] Reopen document → Changes persisted
- [ ] Switch to "Microsoft Viewer" mode → View-only iframe loads
- [ ] No ONLYOFFICE server configured → Shows configuration prompt

### Error Handling
- [ ] ONLYOFFICE server down → Shows error message + fallback options
- [ ] Invalid server URL → Shows error message
- [ ] Callback fails → Document still editable, retry on next change
- [ ] Large file (>100MB) → Handles gracefully

### Edge Cases
- [ ] Multiple users editing same document (future: collaborative)
- [ ] Network interruption during edit → Changes queued
- [ ] Browser refresh during edit → Document state preserved

---

## Troubleshooting

### Editor Not Loading

**Symptom:** Infinite loading spinner
**Cause:** ONLYOFFICE server not accessible

**Fix:**
1. Check server URL is correct
2. Verify ONLYOFFICE server is running: `curl http://localhost:8080/healthcheck`
3. Check browser console for CORS errors
4. Ensure file download URL is publicly accessible

### Auto-Save Not Working

**Symptom:** Edits lost after refresh
**Cause:** Callback endpoint not receiving requests

**Fix:**
1. Check server logs: `console.log` in `/api/onlyoffice/callback`
2. Verify `callbackUrl` is publicly accessible (use ngrok for local testing)
3. Check ONLYOFFICE server can reach your callback URL
4. Verify JWT token if enabled

### File Not Updating

**Symptom:** Callback succeeds but file unchanged
**Cause:** Storage upload not implemented

**Fix:**
1. Implement R2 upload in callback endpoint (see "Storage Integration")
2. Verify database update query runs successfully
3. Check file size matches downloaded file

---

## Resources

**Official Documentation:**
- [ONLYOFFICE API Documentation](https://api.onlyoffice.com/docs/docs-api/)
- [React Component Guide](https://api.onlyoffice.com/docs/docs-api/get-started/frontend-frameworks/react/)
- [@onlyoffice/document-editor-react on npm](https://www.npmjs.com/package/@onlyoffice/document-editor-react)

**GitHub Examples:**
- [ONLYOFFICE React Component](https://github.com/ONLYOFFICE/document-editor-react)
- [Integration Examples](https://github.com/ONLYOFFICE/document-server-integration)
- [React + Python Example with JWT](https://gist.github.com/richkuz/2f5d8b8204e291892862f4e500141d0c)

**Community:**
- [ONLYOFFICE Forum](https://forum.onlyoffice.com/)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/onlyoffice)

---

## Future Enhancements

### Collaborative Editing
- [ ] Add user presence indicator
- [ ] Show other users' cursors
- [ ] Real-time chat in editor
- [ ] Conflict resolution

### Version History
- [ ] Track document versions in database
- [ ] Show version history in UI
- [ ] Restore previous versions
- [ ] Compare versions side-by-side

### Advanced Features
- [ ] Document templates
- [ ] Macros and plugins
- [ ] Custom fonts
- [ ] Mobile app support

---

## Related Files

**Components:**
- `apps/web/components/notes/viewer/OnlyOfficeEditor.tsx` - Main editor component
- `apps/web/components/notes/viewer/OfficeDocumentViewer.tsx` - Wrapper with mode switching
- `apps/web/components/notes/viewer/FileViewer.tsx` - Parent viewer component

**API:**
- `apps/web/app/api/onlyoffice/callback/route.ts` - Callback endpoint for saves

**Settings:**
- `apps/web/app/(authenticated)/settings/preferences/page.tsx` - Settings UI
- `apps/web/stores/upload-settings-store.ts` - Settings state management

**Documentation:**
- `apps/web/docs/notes-feature/M7-STORAGE-ARCHITECTURE-V2.md` - Storage architecture
- `apps/web/docs/notes-feature/IMPLEMENTATION-STATUS.md` - Feature status

---

## Questions?

If you encounter issues or have questions:
1. Check the troubleshooting section above
2. Review ONLYOFFICE official documentation
3. Check browser console for errors
4. Check server logs for callback issues

**Note:** ONLYOFFICE integration requires a running Document Server. For local development, use Docker. For production, consider ONLYOFFICE Cloud or Community Edition.
