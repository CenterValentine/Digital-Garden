/**
 * Round-Trip Verification Utility
 *
 * Compares original TipTap JSON with export→reimport JSON to identify
 * data loss. Classifies differences as lossless, cosmetic, or semantic.
 *
 * Usage (dev console):
 *   import { verifyRoundTrip } from '@/lib/domain/import';
 *   const report = verifyRoundTrip(originalJson, reimportedJson);
 *   console.table(report.differences);
 */

import type { JSONContent } from "@tiptap/core";

export type DifferenceCategory = "lossless" | "cosmetic" | "semantic";

export interface NodeDifference {
  path: string;
  category: DifferenceCategory;
  original: unknown;
  imported: unknown;
  message: string;
}

export interface RoundTripReport {
  identical: boolean;
  losslessCount: number;
  cosmeticCount: number;
  semanticCount: number;
  differences: NodeDifference[];
}

/**
 * Compare original TipTap JSON with export-then-reimport JSON.
 *
 * Classification:
 * - lossless: Structurally identical
 * - cosmetic: Whitespace, mark order, empty attrs (no data loss)
 * - semantic: Missing nodes, changed attrs, lost marks (actual data loss)
 */
export function verifyRoundTrip(
  original: JSONContent,
  reimported: JSONContent
): RoundTripReport {
  const differences: NodeDifference[] = [];

  compareNodes(original, reimported, "doc", differences);

  return {
    identical: differences.length === 0,
    losslessCount: differences.filter((d) => d.category === "lossless").length,
    cosmeticCount: differences.filter((d) => d.category === "cosmetic").length,
    semanticCount: differences.filter((d) => d.category === "semantic").length,
    differences,
  };
}

function compareNodes(
  original: JSONContent,
  reimported: JSONContent,
  path: string,
  differences: NodeDifference[]
): void {
  // Compare node types
  if (original.type !== reimported.type) {
    differences.push({
      path: `${path}.type`,
      category: "semantic",
      original: original.type,
      imported: reimported.type,
      message: `Node type mismatch: "${original.type}" vs "${reimported.type}"`,
    });
    return; // No point comparing further if types differ
  }

  // Compare text content
  if (original.type === "text") {
    const origText = original.text || "";
    const reimText = reimported.text || "";
    if (origText !== reimText) {
      const isWhitespaceOnly = origText.trim() === reimText.trim();
      differences.push({
        path: `${path}.text`,
        category: isWhitespaceOnly ? "cosmetic" : "semantic",
        original: origText,
        imported: reimText,
        message: isWhitespaceOnly
          ? "Whitespace difference in text"
          : `Text content changed: "${origText.slice(0, 50)}" vs "${reimText.slice(0, 50)}"`,
      });
    }

    // Compare marks
    compareMarks(original.marks, reimported.marks, path, differences);
    return;
  }

  // Compare attrs
  compareAttrs(original.attrs, reimported.attrs, path, differences);

  // Compare children
  const origContent = original.content || [];
  const reimContent = reimported.content || [];

  if (origContent.length !== reimContent.length) {
    differences.push({
      path: `${path}.content.length`,
      category: "semantic",
      original: origContent.length,
      imported: reimContent.length,
      message: `Child count mismatch: ${origContent.length} vs ${reimContent.length}`,
    });
  }

  const minLen = Math.min(origContent.length, reimContent.length);
  for (let i = 0; i < minLen; i++) {
    compareNodes(
      origContent[i],
      reimContent[i],
      `${path}.content[${i}]`,
      differences
    );
  }
}

function compareAttrs(
  origAttrs: Record<string, unknown> | undefined,
  reimAttrs: Record<string, unknown> | undefined,
  path: string,
  differences: NodeDifference[]
): void {
  const orig = origAttrs || {};
  const reim = reimAttrs || {};

  // Check if both are empty (cosmetic difference: {} vs undefined)
  const origEmpty = Object.keys(orig).length === 0;
  const reimEmpty = Object.keys(reim).length === 0;
  if (origEmpty && reimEmpty) return;

  const allKeys = new Set([...Object.keys(orig), ...Object.keys(reim)]);

  for (const key of allKeys) {
    const origVal = orig[key];
    const reimVal = reim[key];

    if (origVal === reimVal) continue;
    if (JSON.stringify(origVal) === JSON.stringify(reimVal)) continue;

    // Known cosmetic differences
    if (key === "language" && (origVal === "" || origVal === "plaintext") && (reimVal === "" || reimVal === "plaintext")) {
      continue; // Code block language normalization
    }

    // Tag ID/color missing = semantic (data loss without sidecar)
    const isSemantic = key === "tagId" || key === "color" || key === "level" || key === "checked";

    differences.push({
      path: `${path}.attrs.${key}`,
      category: isSemantic ? "semantic" : "cosmetic",
      original: origVal,
      imported: reimVal,
      message: `Attr "${key}" changed: ${JSON.stringify(origVal)} → ${JSON.stringify(reimVal)}`,
    });
  }
}

function compareMarks(
  origMarks: JSONContent["marks"] | undefined,
  reimMarks: JSONContent["marks"] | undefined,
  path: string,
  differences: NodeDifference[]
): void {
  const orig = origMarks || [];
  const reim = reimMarks || [];

  if (orig.length === 0 && reim.length === 0) return;

  // Sort by type for order-insensitive comparison
  const sortedOrig = [...orig].sort((a, b) => (a.type || "").localeCompare(b.type || ""));
  const sortedReim = [...reim].sort((a, b) => (a.type || "").localeCompare(b.type || ""));

  if (JSON.stringify(sortedOrig) === JSON.stringify(sortedReim)) {
    // Marks are the same but in different order — cosmetic
    if (JSON.stringify(orig) !== JSON.stringify(reim)) {
      differences.push({
        path: `${path}.marks`,
        category: "cosmetic",
        original: orig.map((m) => m.type),
        imported: reim.map((m) => m.type),
        message: "Mark order differs (no data loss)",
      });
    }
    return;
  }

  // Actual mark differences
  const origTypes = new Set(orig.map((m) => m.type));
  const reimTypes = new Set(reim.map((m) => m.type));

  for (const type of origTypes) {
    if (!reimTypes.has(type)) {
      differences.push({
        path: `${path}.marks`,
        category: "semantic",
        original: type,
        imported: null,
        message: `Mark "${type}" lost during round-trip`,
      });
    }
  }

  for (const type of reimTypes) {
    if (!origTypes.has(type)) {
      differences.push({
        path: `${path}.marks`,
        category: "cosmetic",
        original: null,
        imported: type,
        message: `Extra mark "${type}" added during round-trip`,
      });
    }
  }
}
