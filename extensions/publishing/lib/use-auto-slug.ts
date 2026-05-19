/**
 * Auto-slug state hook shared across publishing dialogs.
 *
 * Encapsulates the "slug derives from title until the user edits it" pattern
 * that was previously duplicated in CreatePublicItemDialog,
 * CreatePublicPathDialog, and EditPublicPathDialog.
 *
 * Returns stable callbacks (touched flag lives in a ref, not state) so
 * callers can include them in `useEffect` dep arrays without churn.
 */

import { useCallback, useRef, useState } from "react";
import { slugify, isValidSlug } from "./slug";

const INVALID_SLUG_ERROR = "Slug can only contain a-z, 0-9, and hyphens";

interface UseAutoSlugResult {
  /** Current slug value. */
  slug: string;
  /** Set slug from direct user input — locks the touch state so future
   *  `syncFromTitle` calls become no-ops. */
  setSlug: (value: string) => void;
  /** Update slug from a title source — only takes effect if the user has
   *  not edited the slug directly. Callers control when to invoke this
   *  (in a title-change handler or a useEffect against their title state). */
  syncFromTitle: (title: string) => void;
  /** Validation error or null. */
  error: string | null;
}

export function useAutoSlug(initial?: string): UseAutoSlugResult {
  const [slug, setSlugState] = useState(initial ?? "");
  const touchedRef = useRef(false);

  const syncFromTitle = useCallback((title: string) => {
    if (!touchedRef.current) setSlugState(slugify(title));
  }, []);

  const setSlug = useCallback((value: string) => {
    touchedRef.current = true;
    setSlugState(value);
  }, []);

  const error =
    slug && !isValidSlug(slug) ? INVALID_SLUG_ERROR : null;

  return { slug, setSlug, syncFromTitle, error };
}
