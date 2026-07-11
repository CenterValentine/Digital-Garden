/**
 * Mobile landing shell (server component).
 *
 * The URL the React Native WebView loads by default
 * (EXPO_PUBLIC_DIGITAL_GARDEN_URL → /mobile). A mobile-friendly entry point
 * into the existing web app — NOT a second copy of the product. Static links
 * point at real routes (the workspace + settings); "Recent notes" deep-link
 * into the phone-optimized reader at /mobile/note/[id]. Interactive bits (the
 * external-link bridge button + shell status) live in the MobileLandingActions
 * client island so this page can fetch from Prisma on the server.
 */

import Link from "next/link";

import { getCurrentSession } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";

import { MobileLandingActions } from "./MobileLandingActions";
import styles from "./mobile.module.css";

const PRIMARY = {
  href: "/content",
  title: "Open Workspace",
  desc: "Your notes, file tree, editor, AI chat, and flashcards all live here.",
};

const SECONDARY = [
  { href: "/settings/ai", title: "AI Setup", desc: "Connect models & API keys" },
  { href: "/settings", title: "Settings", desc: "Account, storage, preferences" },
  { href: "/sign-in", title: "Sign in", desc: "If you're not logged in yet" },
];

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default async function MobileHomePage() {
  const userId = (await getCurrentSession())?.user?.id ?? null;

  // Most-recently-edited notes, deep-linked into the mobile reader.
  const recentNotes = userId
    ? await prisma.contentNode.findMany({
        where: { ownerId: userId, contentType: "note", deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, updatedAt: true },
      })
    : [];

  return (
    <div className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.title}>Digital Garden</h1>
        <p className={styles.subtitle}>Mobile</p>
      </header>

      <Link href={PRIMARY.href} className={styles.primaryCard}>
        <span className={styles.cardTitle}>{PRIMARY.title}</span>
        <span className={styles.cardDesc}>{PRIMARY.desc}</span>
      </Link>

      {recentNotes.length > 0 && (
        <section>
          <p className={styles.sectionLabel}>Recent notes</p>
          <div className={styles.recent}>
            {recentNotes.map((note) => (
              <Link
                key={note.id}
                href={`/mobile/note/${note.id}`}
                className={styles.recentItem}
              >
                <span className={styles.recentTitle}>
                  {note.title || "Untitled"}
                </span>
                <span className={styles.recentMeta}>
                  {formatDate(note.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className={styles.grid}>
        {SECONDARY.map((item) => (
          <Link key={item.href} href={item.href} className={styles.card}>
            <span className={styles.cardTitle}>{item.title}</span>
            <span className={styles.cardDesc}>{item.desc}</span>
          </Link>
        ))}
      </div>

      <MobileLandingActions />
    </div>
  );
}
