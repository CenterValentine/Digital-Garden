/**
 * Mobile note reader (server component).
 *
 * A phone-optimized, single-column read view of a note. It reuses the SAME
 * server-side renderer the public website uses (`TipTapContent`), so every
 * custom block (callouts, wiki-links, mermaid, excalidraw, tags, …) renders at
 * full fidelity with zero native duplication. Only the layout/typography is
 * mobile-specific. Editing still happens in the full workspace (`/content`),
 * one tap away via the header.
 *
 * Lives under /mobile, so it inherits the nav-hiding layout and is reachable
 * inside the native shell without desktop chrome.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { JSONContent } from "@tiptap/core";

import { getCurrentSession } from "@/lib/infrastructure/auth/middleware";
import { resolveContentAccess } from "@/lib/domain/collaboration/access";
import { prisma } from "@/lib/database/client";
import { TipTapContent } from "@/components/public/TipTapContent";

import styles from "./note.module.css";

type MobileNotePageProps = {
  // Next.js 16: params is a Promise.
  params: Promise<{ id: string }>;
};

export default async function MobileNotePage({ params }: MobileNotePageProps) {
  const { id } = await params;

  const userId = (await getCurrentSession())?.user?.id;
  if (!userId) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/mobile/note/${id}`)}`);
  }

  // View-level access check — throws on denial or missing content.
  try {
    await resolveContentAccess(prisma, { contentId: id, userId, require: "view" });
  } catch {
    notFound();
  }

  const node = await prisma.contentNode.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      title: true,
      contentType: true,
      notePayload: { select: { tiptapJson: true } },
    },
  });
  if (!node) notFound();

  const workspaceHref = `/content?content=${node.id}`;
  const isNote = node.contentType === "note" && node.notePayload?.tiptapJson != null;

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <Link href="/content" className={styles.headerLink} aria-label="Back to workspace">
          ‹ Notes
        </Link>
        <span className={styles.headerTitle}>{node.title}</span>
        <Link href={workspaceHref} className={styles.headerLink}>
          Edit
        </Link>
      </header>

      <article className={styles.body}>
        {isNote ? (
          <TipTapContent
            bodyJson={node.notePayload!.tiptapJson as unknown as JSONContent}
            className="public-prose"
          />
        ) : (
          <div className={styles.fallback}>
            <p>This item opens in the full workspace.</p>
            <Link href={workspaceHref} className={styles.fallbackButton}>
              Open in workspace
            </Link>
          </div>
        )}
      </article>
    </div>
  );
}
