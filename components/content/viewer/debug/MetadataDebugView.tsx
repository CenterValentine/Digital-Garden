/**
 * Metadata Debug View
 *
 * Displays document statistics, extracted content, and structure analysis.
 * Shows word count, headings, WikiLinks, Callouts, and other metadata.
 */

"use client";

import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";
import { extractOutline } from "@/lib/domain/content/outline-extractor";

interface MetadataDebugViewProps {
  content: JSONContent;
  title: string;
}

interface WikiLink {
  targetTitle: string;
  displayText?: string;
  contentId?: string;
}

interface Callout {
  type: string;
  title?: string;
}

interface DocumentStats {
  wordCount: number;
  characterCount: number;
  nodeCount: number;
  maxDepth: number;
}

/**
 * Count words in text content
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract plain text from document (recursive)
 */
function extractText(node: JSONContent): string {
  if (node.type === "text") {
    return node.text || "";
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractText).join(" ");
  }

  return "";
}

/**
 * Extract WikiLinks from document (recursive)
 */
function extractWikiLinks(node: JSONContent): WikiLink[] {
  const links: WikiLink[] = [];

  if (node.type === "wikiLink") {
    links.push({
      targetTitle: node.attrs?.targetTitle || "",
      displayText: node.attrs?.displayText,
      contentId: node.attrs?.contentId,
    });
  }

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      links.push(...extractWikiLinks(child));
    }
  }

  return links;
}

/**
 * Extract Callouts from document (recursive)
 */
function extractCallouts(node: JSONContent): Callout[] {
  const callouts: Callout[] = [];

  if (node.type === "callout") {
    callouts.push({
      type: node.attrs?.type || "note",
      title: node.attrs?.title,
    });
  }

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      callouts.push(...extractCallouts(child));
    }
  }

  return callouts;
}

/**
 * Count nodes and calculate depth (recursive)
 */
function analyzeStructure(node: JSONContent, depth: number = 0): DocumentStats {
  let nodeCount = 1;
  let maxDepth = depth;

  if (node.content && Array.isArray(node.content)) {
    for (const child of node.content) {
      const childStats = analyzeStructure(child, depth + 1);
      nodeCount += childStats.nodeCount;
      maxDepth = Math.max(maxDepth, childStats.maxDepth);
    }
  }

  return {
    nodeCount,
    maxDepth,
    wordCount: 0, // Calculated separately
    characterCount: 0, // Calculated separately
  };
}

export function MetadataDebugView({ content, title }: MetadataDebugViewProps) {
  // Extract all metadata
  const metadata = useMemo(() => {
    const text = extractText(content);
    const structure = analyzeStructure(content);
    const headings = extractOutline(content);
    const wikiLinks = extractWikiLinks(content);
    const callouts = extractCallouts(content);

    return {
      stats: {
        wordCount: countWords(text),
        characterCount: text.length,
        nodeCount: structure.nodeCount,
        maxDepth: structure.maxDepth,
      },
      headings,
      wikiLinks,
      callouts,
    };
  }, [content]);

  return (
    <div className="h-full flex flex-col bg-black/40 overflow-auto">
      {/* Header */}
      <div className="flex-none px-4 py-3 border-b border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Document Metadata</h3>
          <p className="text-xs text-gray-400">{title}</p>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {/* Document Statistics */}
        <section>
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            Statistics
          </h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-black/30 rounded-lg p-3">
              <div className="text-gray-400 text-xs">Words</div>
              <div className="text-2xl font-semibold text-foreground mt-1">
                {metadata.stats.wordCount.toLocaleString()}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg p-3">
              <div className="text-gray-400 text-xs">Characters</div>
              <div className="text-2xl font-semibold text-foreground mt-1">
                {metadata.stats.characterCount.toLocaleString()}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg p-3">
              <div className="text-gray-400 text-xs">Nodes</div>
              <div className="text-2xl font-semibold text-foreground mt-1">
                {metadata.stats.nodeCount.toLocaleString()}
              </div>
            </div>
            <div className="bg-black/30 rounded-lg p-3">
              <div className="text-gray-400 text-xs">Max Depth</div>
              <div className="text-2xl font-semibold text-foreground mt-1">
                {metadata.stats.maxDepth}
              </div>
            </div>
          </div>
        </section>

        {/* Headings */}
        <section>
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            Headings
            <span className="text-gray-500 font-normal">({metadata.headings.length})</span>
          </h4>
          {metadata.headings.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No headings found</div>
          ) : (
            <div className="space-y-2">
              {metadata.headings.map((heading, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 text-xs"
                  style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}
                >
                  <span className="text-gray-500 font-mono">H{heading.level}</span>
                  <span className="text-gray-300">{heading.text}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* WikiLinks */}
        <section>
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            Wiki Links
            <span className="text-gray-500 font-normal">({metadata.wikiLinks.length})</span>
          </h4>
          {metadata.wikiLinks.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No wiki links found</div>
          ) : (
            <div className="space-y-2">
              {metadata.wikiLinks.map((link, index) => (
                <div key={index} className="bg-black/30 rounded-lg p-2 text-xs">
                  <div className="text-blue-400 font-mono">
                    [[{link.targetTitle}
                    {link.displayText && `|${link.displayText}`}]]
                  </div>
                  {link.contentId && (
                    <div className="text-gray-500 text-[10px] mt-1">
                      ID: {link.contentId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Callouts */}
        <section>
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider flex items-center gap-2">
            Callouts
            <span className="text-gray-500 font-normal">({metadata.callouts.length})</span>
          </h4>
          {metadata.callouts.length === 0 ? (
            <div className="text-xs text-gray-500 italic">No callouts found</div>
          ) : (
            <div className="space-y-2">
              {metadata.callouts.map((callout, index) => (
                <div key={index} className="bg-black/30 rounded-lg p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-400 font-mono">
                      [!{callout.type}]
                    </span>
                    {callout.title && (
                      <span className="text-gray-300">{callout.title}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Document Type */}
        <section>
          <h4 className="text-xs font-semibold text-gray-300 mb-3 uppercase tracking-wider">
            Document Info
          </h4>
          <div className="bg-black/30 rounded-lg p-3 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="text-gray-300 font-mono">{content.type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Reading Time</span>
              <span className="text-gray-300">
                {Math.ceil(metadata.stats.wordCount / 200)} min
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
