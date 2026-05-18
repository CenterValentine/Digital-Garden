/**
 * Content seed fixture — for tests that need known content state.
 *
 * Wraps the auth fixture with `seed.*` helpers that create
 * ContentNode + payload rows via the `/api/content/content` endpoint
 * (so the create path is exercised as a side effect) and hard-delete
 * them via Prisma after each test (so the soft-delete trash bin
 * doesn't accumulate from test runs).
 *
 * Use this fixture for any test that needs specific content state.
 * For tests that only need an authenticated session, the lighter
 * `_fixtures/auth.ts` is sufficient.
 *
 * Example:
 *   import { test, expect } from "../_fixtures/content";
 *
 *   test("note renders with seeded content", async ({ page, themedGoto, seed }) => {
 *     const note = await seed.note({
 *       title: "Hello Test",
 *       markdown: "# Heading\n\nBody text.",
 *     });
 *     await themedGoto(`/content?content=${note.id}`);
 *     await expect(page.getByRole("heading", { name: "Heading" })).toBeVisible();
 *   });
 *
 * Cleanup happens automatically when the test finishes — created nodes
 * are hard-deleted (Prisma `deleteMany`), which cascades to their
 * payloads and most related rows. Deleted in reverse-creation order
 * so child-before-parent constraints don't fire.
 */

import { test as authTest, expect } from "./auth";
import { testPrisma } from "./db";

type SeededNodeType =
  | "folder"
  | "note"
  | "html"
  | "code"
  | "external"
  | "visualization";

export interface SeededNode {
  id: string;
  slug: string;
  title: string;
  type: SeededNodeType;
}

interface SeedNoteInput {
  title?: string;
  parentId?: string | null;
  /**
   * TipTap JSON document to seed into the note's payload. Mutually
   * exclusive with `markdown`. If neither is provided, a small default
   * "Hello world" doc is used.
   */
  tiptapJson?: Record<string, unknown>;
  /**
   * Markdown source — converted server-side to TipTap JSON via the
   * same path normal note creation uses. Mutually exclusive with
   * `tiptapJson`.
   */
  markdown?: string;
}

interface SeedFolderInput {
  title?: string;
  parentId?: string | null;
}

export interface SeedHelpers {
  note(input?: SeedNoteInput): Promise<SeededNode>;
  folder(input?: SeedFolderInput): Promise<SeededNode>;
  /** Direct read of the tracked IDs for the current test. Mostly for assertions. */
  trackedIds(): readonly string[];
}

type ContentFixtures = {
  seed: SeedHelpers;
};

const DEFAULT_NOTE_JSON = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Seeded Test Note" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "This note was created by the Playwright content seed fixture.",
        },
      ],
    },
  ],
};

/**
 * Generate a short, unique-enough suffix for test titles so concurrent
 * worker tests don't collide on (ownerId, slug) which is unique in
 * the schema. The slug is derived server-side from the title.
 */
function uniqueSuffix(): string {
  // 6 hex chars from Math.random — collision odds are negligible at
  // suite size and we're cleaning up after each test anyway.
  return Math.random().toString(16).slice(2, 8);
}

interface ApiResponseShape<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface CreatedNodeData {
  id: string;
  slug: string;
  title: string;
}

export const test = authTest.extend<ContentFixtures>({
  // Note: depends on `page` (not the test-level `request` fixture) so the
  // POST shares cookies with the browser context. Playwright's test-level
  // `request` fixture has its own isolated cookie jar that does NOT load
  // the project's storageState — using it here would send unauthenticated
  // requests and the API would reject them with "Authentication required".
  seed: async ({ page }, use) => {
    const ids: string[] = [];

    async function postContent(
      body: Record<string, unknown>,
    ): Promise<CreatedNodeData> {
      const response = await page.request.post("/api/content/content", {
        data: body,
      });
      const json = (await response.json()) as ApiResponseShape<CreatedNodeData>;

      if (!response.ok() || !json.success || !json.data) {
        throw new Error(
          `seed.* fixture: POST /api/content/content failed (${response.status()}). ` +
            `Body: ${JSON.stringify(json.error ?? json)}`,
        );
      }

      ids.push(json.data.id);
      return json.data;
    }

    const helpers: SeedHelpers = {
      async note(input = {}) {
        if (input.tiptapJson && input.markdown) {
          throw new Error(
            "seed.note: pass either `tiptapJson` or `markdown`, not both",
          );
        }
        const data = await postContent({
          title: input.title ?? `[e2e] note ${uniqueSuffix()}`,
          parentId: input.parentId ?? null,
          ...(input.markdown
            ? { markdown: input.markdown }
            : { tiptapJson: input.tiptapJson ?? DEFAULT_NOTE_JSON }),
        });
        return { ...data, type: "note" };
      },

      async folder(input = {}) {
        const data = await postContent({
          title: input.title ?? `[e2e] folder ${uniqueSuffix()}`,
          parentId: input.parentId ?? null,
          isFolder: true,
        });
        return { ...data, type: "folder" };
      },

      trackedIds() {
        return ids;
      },
    };

    await use(helpers);

    // Hard-delete in reverse creation order. Children (created later)
    // delete before parents (created earlier), satisfying the
    // `Hierarchy` relation's onDelete: NoAction constraint. Cascades
    // handle payloads and most other related rows automatically.
    if (ids.length === 0) return;
    const reversed = [...ids].reverse();
    try {
      await testPrisma().contentNode.deleteMany({
        where: { id: { in: reversed } },
      });
    } catch (err) {
      // Don't mask test failures with cleanup errors — just log loudly.
      console.error(
        `seed.* fixture: cleanup failed for ${reversed.length} nodes`,
        err,
      );
    }
  },
});

export { expect };
