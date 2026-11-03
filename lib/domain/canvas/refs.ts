/**
 * Canvas archive — what a URL inside course HTML points at.
 *
 * The two sources spell internal links differently: the live API serves
 * `/courses/42/pages/lipid-bilayers`, a Common Cartridge export rewrites the
 * same link to `$WIKI_REFERENCE$/pages/lipid-bilayers`. Both resolve to one
 * refKey ("page:lipid-bilayers"), so link rewriting doesn't care where the
 * course came from.
 *
 * Pure. Pinned by `pnpm canvas:check`.
 */

import type { CanvasRefResolver } from "./html";

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Strip query and fragment. */
function bare(url: string): string {
  return url.split(/[?#]/)[0];
}

/** Resolver for HTML served by the Canvas REST API of `baseUrl`. */
export function createApiRefResolver(baseUrl: string): CanvasRefResolver {
  const base = new URL(baseUrl);
  const host = base.host.toLowerCase();

  function pathOf(url: string): string | null {
    if (url.startsWith("/")) return bare(url);
    try {
      const parsed = new URL(url);
      return parsed.host.toLowerCase() === host ? parsed.pathname : null;
    } catch {
      return null;
    }
  }

  return {
    refKeyOf(url) {
      const path = pathOf(url);
      if (!path) return null;
      const p = path.replace(/^\/api\/v1(?=\/)/, "");
      let match = /^\/courses\/[^/]+\/(?:pages|wiki)\/([^/]+)\/?$/.exec(p);
      if (match) return `page:${safeDecode(match[1]).toLowerCase()}`;
      match = /^(?:\/courses\/[^/]+)?\/files\/(\d+)(?:\/(?:download|preview))?\/?$/.exec(p);
      if (match) return `file:${match[1]}`;
      match = /^\/courses\/[^/]+\/assignments\/(\d+)\/?$/.exec(p);
      if (match) return `assignment:${match[1]}`;
      match = /^\/courses\/[^/]+\/discussion_topics\/(\d+)\/?$/.exec(p);
      if (match) return `discussion:${match[1]}`;
      match = /^\/courses\/[^/]+\/quizzes\/(\d+)\/?$/.exec(p);
      if (match) return `quiz:${match[1]}`;
      match = /^\/courses\/[^/]+\/modules\/items\/(\d+)\/?$/.exec(p);
      if (match) return `item:${match[1]}`;
      return null;
    },
    isInternal(url) {
      // Relative or same-host: it only works inside this Canvas
      // (/courses/1/grades, /equation_images/…), resolved or not.
      return pathOf(url) !== null;
    },
    absolute(url) {
      return url.startsWith("/") ? `${base.origin}${url}` : url;
    },
  };
}

const CARTRIDGE_TOKEN = /^(?:\$|%24)([A-Z_-]+)(?:\$|%24)(.*)$/i;

/** Resolver for HTML inside a Common Cartridge export. */
export function createCartridgeRefResolver(): CanvasRefResolver {
  return {
    refKeyOf(url) {
      const match = CARTRIDGE_TOKEN.exec(url);
      if (!match) return null;
      const token = match[1].toUpperCase();
      const rest = bare(match[2]).replace(/^\/+/, "");
      if (token === "IMS-CC-FILEBASE" || token === "IMS_CC_FILEBASE") {
        return `filepath:${safeDecode(rest)}`;
      }
      if (token === "WIKI_REFERENCE") {
        const page = /^pages\/(.+)$/.exec(rest);
        return page ? `page:${safeDecode(page[1]).toLowerCase()}` : null;
      }
      if (token === "CANVAS_OBJECT_REFERENCE") {
        const object = /^(assignments|discussion_topics|quizzes)\/(.+)$/.exec(rest);
        if (!object) return null;
        const kind = object[1] === "assignments" ? "assignment" : object[1] === "quizzes" ? "quiz" : "discussion";
        return `${kind}:${safeDecode(object[2])}`;
      }
      if (token === "CANVAS_COURSE_REFERENCE") {
        const item = /^modules\/items\/(.+)$/.exec(rest);
        return item ? `item:${safeDecode(item[1])}` : null;
      }
      return null;
    },
    isInternal(url) {
      return CARTRIDGE_TOKEN.test(url);
    },
    absolute() {
      // A cartridge link has no live address to fall back to.
      return "#";
    },
  };
}
