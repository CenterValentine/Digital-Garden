"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  useReaderPreferences,
  useReaderSession,
  type ReaderOpenBook,
  type ReaderSidebarView,
  type ReaderTocItem,
} from "../state/reader-store";
import { AnnotationsPanel } from "./AnnotationsPanel";

const VIEWS: Array<{ id: ReaderSidebarView; label: string }> = [
  { id: "notes", label: "Notes" },
  { id: "contents", label: "Contents" },
  { id: "settings", label: "Display" },
  { id: "about", label: "About" },
];

/**
 * The open book's side views — highlights & notes, contents, display
 * settings, details. Rendered in the app's right sidebar (Book tab); in full
 * screen, where that sidebar is out of view, the reader shows the same
 * component as a drawer.
 */
export function ReaderBookSidebar({
  contentId,
  book,
  about,
  onClose,
}: {
  contentId: string;
  book: ReaderOpenBook;
  /** Details panel; absent while the book's metadata loads. */
  about: ReactNode | null;
  /** Drawer mode (full screen): a close button. */
  onClose?: () => void;
}) {
  const stored = useReaderSession((state) => state.sidebarView[contentId] ?? "notes");
  const setView = useReaderSession((state) => state.setSidebarView);
  const view = stored === "about" && !about ? "notes" : stored;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-0.5 border-b border-black/10 p-1.5 dark:border-white/10" role="tablist">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            disabled={id === "about" && !about}
            onClick={() => setView(contentId, id)}
            className={`flex-1 truncate rounded px-1.5 py-1 text-xs font-medium disabled:opacity-40 ${
              view === id
                ? "bg-black/10 text-foreground dark:bg-white/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {id === "notes" && book.annotations.length ? ` (${book.annotations.length})` : ""}
          </button>
        ))}
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {view === "notes" && (
          <AnnotationsPanel
            hideTitle
            className="h-full"
            annotations={book.annotations}
            onGo={book.go}
            onDelete={book.remove}
            onUpdate={book.update}
            onSent={book.sent}
          />
        )}
        {view === "contents" && <ContentsView book={book} />}
        {view === "settings" && <DisplaySettings />}
        {view === "about" && about}
      </div>
    </div>
  );
}

function ContentsView({ book }: { book: ReaderOpenBook }) {
  if (!book.toc.length) {
    return <p className="p-3 text-xs text-muted-foreground">This book has no table of contents.</p>;
  }
  const renderItems = (items: ReaderTocItem[], depth = 0) => (
    <ul className={depth ? "ml-3 border-l border-black/10 pl-2 dark:border-white/10" : ""}>
      {items.map((item) => (
        <li key={`${item.href}-${item.label}`}>
          <button
            type="button"
            onClick={() => book.goToHref(item.href)}
            className={`w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-black/5 dark:hover:bg-white/5 ${
              item.label === book.currentLabel ? "font-semibold text-primary" : ""
            }`}
          >
            {item.label}
          </button>
          {item.subitems?.length ? renderItems(item.subitems, depth + 1) : null}
        </li>
      ))}
    </ul>
  );
  return <div className="h-full overflow-auto p-2">{renderItems(book.toc)}</div>;
}

/** Typography, theme and layout — reader preferences, shared by every book. */
function DisplaySettings() {
  const fontSizePct = useReaderPreferences((state) => state.fontSizePct);
  const lineHeight = useReaderPreferences((state) => state.lineHeight);
  const theme = useReaderPreferences((state) => state.theme);
  const flow = useReaderPreferences((state) => state.flow);
  const setFontSizePct = useReaderPreferences((state) => state.setFontSizePct);
  const setLineHeight = useReaderPreferences((state) => state.setLineHeight);
  const setTheme = useReaderPreferences((state) => state.setTheme);
  const setFlow = useReaderPreferences((state) => state.setFlow);

  const choice = (active: boolean) =>
    `rounded border px-2 py-1 capitalize ${active ? "border-primary" : "border-black/10 dark:border-white/10"}`;

  return (
    <div className="h-full space-y-4 overflow-auto p-3 text-xs">
      <label className="block">
        <span className="text-muted-foreground">Text size — {fontSizePct}%</span>
        <input
          type="range"
          min={70}
          max={200}
          step={5}
          value={fontSizePct}
          onChange={(event) => setFontSizePct(Number(event.target.value))}
          className="w-full"
        />
      </label>
      <label className="block">
        <span className="text-muted-foreground">Line spacing — {lineHeight.toFixed(2)}</span>
        <input
          type="range"
          min={1.1}
          max={2.2}
          step={0.05}
          value={lineHeight}
          onChange={(event) => setLineHeight(Number(event.target.value))}
          className="w-full"
        />
      </label>
      <div>
        <span className="text-muted-foreground">Theme</span>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(["system", "light", "sepia", "dark"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setTheme(option)} className={choice(theme === option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-muted-foreground">Layout</span>
        <div className="mt-1 grid grid-cols-2 gap-1">
          {(["paginated", "scrolled"] as const).map((option) => (
            <button key={option} type="button" onClick={() => setFlow(option)} className={choice(flow === option)}>
              {option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
