# Testing Strategy

**Version:** 1.0  
**Last Updated:** January 10, 2026

## Testing Pyramid

```
        E2E Tests
      ────────────
    Integration Tests
   ─────────────────────
       Unit Tests
 ──────────────────────────
```

## Unit Testing

### Component Tests (React Testing Library)

```typescript
// __tests__/components/FileTree.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { FileTree } from '@/components/content/FileTree';

describe('FileTree', () => {
  it('renders file tree nodes', () => {
    const nodes = [
      { id: '1', title: 'Folder', docType: 'Folder', hasChildren: true },
      { id: '2', title: 'File.md', docType: 'Note', hasChildren: false },
    ];

    render(<FileTree nodes={nodes} />);

    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByText('File.md')).toBeInTheDocument();
  });

  it('expands/collapses folders on click', () => {
    const { container } = render(<FileTree nodes={mockNodes} />);
    const folder = screen.getByText('Folder');

    fireEvent.click(folder);
    expect(container.querySelector('[data-expanded="true"]')).toBeInTheDocument();
  });
});
```

### API Route Tests (Jest)

```typescript
// __tests__/api/content/files.test.ts
import { POST } from "@/app/api/content/files/route";

describe("POST /api/content/files", () => {
  it("creates a new document", async () => {
    const request = new Request("http://localhost/api/content/files", {
      method: "POST",
      body: JSON.stringify({
        docType: "Note",
        title: "Test Note",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.title).toBe("Test Note");
  });

  it("requires authentication", async () => {
    // Test without auth session
    const request = new Request("http://localhost/api/content/files", {
      method: "POST",
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

## Integration Testing

### Database + API Tests

```typescript
// __tests__/integration/file-upload.test.ts
describe("File Upload Flow", () => {
  beforeEach(async () => {
    await setupTestDatabase();
  });

  it("completes full upload flow", async () => {
    // 1. Get presigned URL
    const presignedResponse = await fetch("/api/content/files/upload", {
      method: "POST",
      body: JSON.stringify({
        fileName: "test.pdf",
        mimeType: "application/pdf",
        fileSize: 1024,
      }),
    });

    const { uploadUrl, contentId } = await presignedResponse.json();

    // 2. Upload to storage (mock)
    await mockStorageUpload(uploadUrl, testFile);

    // 3. Confirm upload
    const confirmResponse = await fetch("/api/content/files/upload/confirm", {
      method: "POST",
      body: JSON.stringify({ contentId }),
    });

    expect(confirmResponse.status).toBe(200);

    // 4. Verify database entry
    const document = await prisma.structuredDocument.findUnique({
      where: { id: contentId },
      include: { fileMetadata: true },
    });

    expect(document).toBeDefined();
    expect(document.fileMetadata).toBeDefined();
  });
});
```

## End-to-End Testing (Playwright)

### Critical User Journeys

```typescript
// e2e/notes-feature.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Notes Feature", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/notes");
    await page.waitForLoadState("networkidle");
  });

  test("create and edit a note", async ({ page }) => {
    // Click "New Note" button
    await page.click('[data-testid="new-note-button"]');

    // Type title
    await page.fill('[data-testid="note-title-input"]', "My Test Note");

    // Type content in editor
    await page.click(".ProseMirror");
    await page.keyboard.type("This is test content");

    // Wait for auto-save
    await page.waitForSelector(
      '[data-testid="save-status"][data-status="saved"]'
    );

    // Verify note appears in file tree
    await expect(page.locator("text=My Test Note")).toBeVisible();
  });

  test("upload and view file", async ({ page }) => {
    // Click upload button
    await page.click('[data-testid="upload-file-button"]');

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles("tests/fixtures/sample.pdf");

    // Wait for upload to complete
    await page.waitForSelector(
      '[data-testid="upload-progress"][data-complete="true"]'
    );

    // Click on uploaded file
    await page.click("text=sample.pdf");

    // Verify PDF viewer loads
    await expect(page.locator(".pdf-viewer")).toBeVisible();
  });

  test("search functionality", async ({ page }) => {
    // Open command palette
    await page.keyboard.press("Meta+K");

    // Type search query
    await page.fill('[data-testid="command-input"]', "test");

    // Verify results appear
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });
});
```

## Accessibility Testing

```typescript
// __tests__/a11y/notes.test.tsx
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

describe('Accessibility', () => {
  it('has no violations in file tree', async () => {
    const { container } = render(<FileTree nodes={mockNodes} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('supports keyboard navigation', () => {
    render(<NotesLayout />);

    // Tab through interactive elements
    userEvent.tab();
    expect(screen.getByRole('button', { name: 'New Note' })).toHaveFocus();

    userEvent.tab();
    expect(screen.getByRole('search')).toHaveFocus();
  });
});
```

## Performance Testing

```typescript
// __tests__/performance/virtualization.test.tsx
describe('Performance', () => {
  it('handles large file trees efficiently', () => {
    const largeTree = generateMockNodes(10000);

    const startTime = performance.now();
    render(<FileTree nodes={largeTree} />);
    const endTime = performance.now();

    expect(endTime - startTime).toBeLessThan(100); // < 100ms
  });

  it('virtualizes long lists', () => {
    const { container } = render(<FileTree nodes={generateMockNodes(1000)} />);

    // Should only render visible nodes (~50-100)
    const renderedNodes = container.querySelectorAll('[data-tree-node]');
    expect(renderedNodes.length).toBeLessThan(150);
  });
});
```

## Test Coverage Goals

| Area               | Target Coverage |
| ------------------ | --------------- |
| Components         | 80%+            |
| API Routes         | 90%+            |
| Utils/Libs         | 95%+            |
| E2E Critical Paths | 100%            |

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
```

## Next Steps

1. Review [Implementation Guide](./11-implementation-guide.md) for TDD approach
2. See [Performance](./13-performance.md) for performance benchmarks
3. Check [Security Model](./05-security-model.md) for security testing
