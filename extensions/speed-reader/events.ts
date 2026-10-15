export const SPEED_READER_OPEN_EVENT = "dg:speed-reader-open";

export interface SpeedReaderOpenEventDetail {
  sourceContentId?: string | null;
  sourceTitle?: string | null;
}

/**
 * A page of text a host surface hands the speed reader.
 */
export interface SpeedReaderPage {
  text: string;
  /** Where this page is ("Chapter 3", …), shown in the header. */
  label?: string;
}

/**
 * Surfaces that page their content (the e-reader) register one of these for
 * the content id they show. The speed reader then reads what's on screen,
 * not the whole document from the top: `current()` is the visible page,
 * `next()` turns the host's page and returns the new one (null at the end).
 */
export interface SpeedReaderPagedSource {
  current(): Promise<SpeedReaderPage | null>;
  next(): Promise<SpeedReaderPage | null>;
}

const pagedSources = new Map<string, SpeedReaderPagedSource>();

export function registerSpeedReaderPagedSource(
  contentId: string,
  source: SpeedReaderPagedSource
): () => void {
  pagedSources.set(contentId, source);
  return () => {
    if (pagedSources.get(contentId) === source) pagedSources.delete(contentId);
  };
}

export function getSpeedReaderPagedSource(contentId: string): SpeedReaderPagedSource | null {
  return pagedSources.get(contentId) ?? null;
}
