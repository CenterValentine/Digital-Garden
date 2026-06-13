/**
 * POST /api/speed-reader/extract
 *
 * Server-side article extraction for external links. Uses jsdom + Readability
 * to pull the main article text out of an HTML page (same approach as Pocket /
 * Reader View). Server-side because most sites block browser fetches via CORS.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth/middleware";
import { prisma } from "@/lib/database/client";
import { validateExternalUrl } from "@/lib/domain/content/external-validation";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/speed-reader/extract";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 5_000_000;

interface ExtractRequestBody {
  contentId?: string;
  url?: string;
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async () => {
    try {
      const session = await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth()
      );

      const body = (await request.json()) as ExtractRequestBody;

      let targetUrl: string | null = null;
      let cachedTitle: string | null = null;

      if (body.contentId) {
        const node = await prisma.contentNode.findFirst({
          where: { id: body.contentId, ownerId: session.user.id },
          select: {
            title: true,
            externalPayload: { select: { url: true, canonicalUrl: true } },
          },
        });
        if (!node || !node.externalPayload) {
          return NextResponse.json(
            {
              success: false,
              error: "Content not found or not external",
            },
            { status: 404 }
          );
        }
        targetUrl = node.externalPayload.canonicalUrl || node.externalPayload.url;
        cachedTitle = node.title;
      } else if (body.url) {
        targetUrl = body.url;
      }

      if (!targetUrl) {
        return NextResponse.json(
          { success: false, error: "Missing contentId or url" },
          { status: 400 }
        );
      }

      const validation = validateExternalUrl(targetUrl);
      if (!validation.valid) {
        return NextResponse.json(
          { success: false, error: validation.error ?? "Invalid URL" },
          { status: 400 }
        );
      }

      const html = await fetchHtmlWithLimit(targetUrl);
      const article = await extractArticleText(html, targetUrl);

      if (!article.text || article.text.length < 80) {
        return NextResponse.json(
          {
            success: false,
            error: "Could not find readable text on the page.",
          },
          { status: 422 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          text: article.text,
          title: article.title || cachedTitle,
          byline: article.byline,
          excerpt: article.excerpt,
        },
      });
    } catch (error: unknown) {
      logger.error({
        layer: "external",
        event: "speed_reader_extract:caught",
        summary: "extraction failed — 500",
        error,
      });
      const message =
        error instanceof Error ? error.message : "Extraction failed";
      return NextResponse.json(
        { success: false, error: message },
        { status: 500 }
      );
    }
  });
}

async function fetchHtmlWithLimit(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        // Many sites serve different HTML to "browser-ish" User-Agents.
        "User-Agent":
          "Mozilla/5.0 (compatible; DigitalGardenSpeedReader/1.0; +https://davidvalentine.org)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`Source responded ${response.status}`);
    }
    const reader = response.body?.getReader();
    if (!reader) return await response.text();

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_HTML_BYTES) {
        reader.cancel();
        throw new Error("Page is too large to extract");
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8").decode(merged);
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ExtractedArticle {
  text: string;
  title: string | null;
  byline: string | null;
  excerpt: string | null;
}

async function extractArticleText(
  html: string,
  url: string
): Promise<ExtractedArticle> {
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  if (!parsed) {
    return { text: "", title: null, byline: null, excerpt: null };
  }

  // Readability's `textContent` collapses paragraphs; for RSVP we want
  // paragraph boundaries (\n\n) to drive punctuation pauses. Walk the
  // serialized HTML and rebuild.
  const articleDom = new JSDOM(parsed.content ?? "");
  const text = blockwiseText(articleDom.window.document.body);

  return {
    text,
    title: parsed.title ?? null,
    byline: parsed.byline ?? null,
    excerpt: parsed.excerpt ?? null,
  };
}

const BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "LI",
  "PRE",
  "FIGCAPTION",
  "ARTICLE",
  "SECTION",
]);

function blockwiseText(root: Element): string {
  const parts: string[] = [];
  const walker = (node: Node): void => {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const t = node.textContent?.replace(/\s+/g, " ");
      if (t && t.trim()) parts.push(t);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const isBlock = BLOCK_TAGS.has(el.tagName);
    el.childNodes.forEach(walker);
    if (isBlock) parts.push("\n\n");
  };
  walker(root);
  return parts.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
