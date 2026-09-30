/**
 * Minimal type surface for foliate-js (plain ES modules, no bundled types).
 * Only what the reader uses — see node_modules/foliate-js/README.md.
 */

declare module "foliate-js/view.js" {
  export interface FoliateTocItem {
    label: string;
    href: string;
    subitems?: FoliateTocItem[];
  }

  export interface FoliateBook {
    metadata?: Record<string, unknown>;
    toc?: FoliateTocItem[];
    sections: Array<{ id: unknown; cfi?: string; linear?: string }>;
    dir?: string;
    transformTarget?: EventTarget;
  }

  export interface FoliateRelocateDetail {
    fraction?: number;
    cfi: string;
    range?: Range;
    tocItem?: { label?: string; href?: string } | null;
    pageItem?: { label?: string } | null;
    location?: { current: number; next: number; total: number };
  }

  export interface FoliateAnnotation {
    value: string;
    color?: string;
  }

  export interface FoliateRenderer extends HTMLElement {
    setStyles?: (styles: string | [string, string]) => void;
    getContents(): Array<{ doc: Document; index: number }>;
    next(): Promise<void>;
    prev(): Promise<void>;
  }

  export interface FoliateView extends HTMLElement {
    book: FoliateBook;
    renderer: FoliateRenderer;
    lastLocation?: FoliateRelocateDetail;
    open(book: File | Blob | string | FoliateBook): Promise<void>;
    close(): void;
    init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
    goTo(target: string | number): Promise<unknown>;
    goToFraction(fraction: number): Promise<void>;
    goLeft(): Promise<void>;
    goRight(): Promise<void>;
    next(): Promise<void>;
    prev(): Promise<void>;
    getCFI(index: number, range?: Range): string;
    addAnnotation(annotation: FoliateAnnotation, remove?: boolean): Promise<unknown>;
    deleteAnnotation(annotation: FoliateAnnotation): Promise<unknown>;
    showAnnotation(annotation: FoliateAnnotation): Promise<void>;
    /** Full-text search; yields per-section results, progress, then "done". */
    search(options: { query: string; index?: number; matchCase?: boolean; matchDiacritics?: boolean; matchWholeWords?: boolean }): AsyncGenerator<
      | { label: string; subitems: Array<{ cfi: string; excerpt: { pre: string; match: string; post: string } }> }
      | { progress: number }
      | "done"
    >;
    clearSearch(): void;
  }

  export function makeBook(file: File | Blob | string): Promise<FoliateBook>;
  export class View extends HTMLElement {}
}

declare module "foliate-js/overlayer.js" {
  export type OverlayDrawer = (
    rects: DOMRectList | DOMRect[],
    options?: Record<string, unknown>
  ) => SVGElement;
  export class Overlayer {
    static highlight: OverlayDrawer;
    static underline: OverlayDrawer;
    static squiggly: OverlayDrawer;
  }
}
