/**
 * Export/Import Validation & Error Detection
 *
 * Robust error handling to detect discrepancies and schema issues
 */

import type { JSONContent } from "@tiptap/core";
import type { MetadataSidecar } from "./metadata";
import { getCurrentSchemaVersion, getCurrentSchemaSnapshot } from "@/lib/domain/editor/schema-version";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  metadata?: {
    checkedAt: string;
    schemaVersion: string;
  };
}

export interface ValidationError {
  code: string;
  message: string;
  severity: "critical" | "high" | "medium" | "low";
  context?: Record<string, unknown>;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion?: string;
}

/**
 * Validate TipTap JSON before export
 *
 * Catches issues that might break converters
 */
export function validateTipTapJSON(json: JSONContent): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check 1: Valid document structure
  if (!json || typeof json !== "object") {
    errors.push({
      code: "INVALID_STRUCTURE",
      message: "TipTap JSON is not a valid object",
      severity: "critical",
      context: { received: typeof json },
    });
    return { valid: false, errors, warnings };
  }

  if (json.type !== "doc") {
    errors.push({
      code: "INVALID_ROOT",
      message: "Root node must be type 'doc'",
      severity: "critical",
      context: { received: json.type },
    });
  }

  // Check 2: Validate node types
  const unknownNodes: string[] = [];
  const supportedSnapshot = getCurrentSchemaSnapshot();

  function traverse(node: JSONContent, path: string = "root") {
    if (!node) return;

    // Check node type
    if (node.type && !supportedSnapshot.nodes.includes(node.type)) {
      unknownNodes.push(node.type);
      warnings.push({
        code: "UNKNOWN_NODE_TYPE",
        message: `Unknown node type '${node.type}' at ${path}`,
        suggestion: `Add '${node.type}' to schema or update converters to handle it`,
      });
    }

    // Check marks
    if (node.marks) {
      node.marks.forEach((mark, idx) => {
        if (!supportedSnapshot.marks.includes(mark.type)) {
          warnings.push({
            code: "UNKNOWN_MARK_TYPE",
            message: `Unknown mark type '${mark.type}' at ${path}/marks[${idx}]`,
            suggestion: `Add '${mark.type}' to schema or update converters`,
          });
        }
      });
    }

    // Check attributes
    if (node.attrs) {
      const requiredAttrs = getRequiredAttributes(node.type);
      for (const required of requiredAttrs) {
        if (!(required in node.attrs)) {
          errors.push({
            code: "MISSING_REQUIRED_ATTRIBUTE",
            message: `Node '${node.type}' missing required attribute '${required}' at ${path}`,
            severity: "high",
            context: { nodeType: node.type, missingAttr: required, path },
          });
        }
      }
    }

    // Traverse children
    if (node.content) {
      node.content.forEach((child, idx) => {
        traverse(child, `${path}/content[${idx}]`);
      });
    }
  }

  traverse(json);

  // Check 3: Detect circular references
  try {
    JSON.stringify(json);
  } catch (error) {
    errors.push({
      code: "CIRCULAR_REFERENCE",
      message: "TipTap JSON contains circular references",
      severity: "critical",
      context: { error: error instanceof Error ? error.message : "Unknown" },
    });
  }

  // Check 4: Size validation
  const jsonString = JSON.stringify(json);
  const sizeKB = Buffer.byteLength(jsonString, "utf-8") / 1024;

  if (sizeKB > 10000) {
    // 10MB
    warnings.push({
      code: "LARGE_DOCUMENT",
      message: `Document is very large (${sizeKB.toFixed(2)}KB)`,
      suggestion: "Consider splitting into smaller documents",
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metadata: {
      checkedAt: new Date().toISOString(),
      schemaVersion: getCurrentSchemaVersion(),
    },
  };
}

/**
 * Validate metadata sidecar
 *
 * Ensures metadata is consistent with content
 */
export function validateMetadata(
  metadata: MetadataSidecar,
  tiptapJson: JSONContent
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check 1: Required fields
  const requiredFields = ["version", "schemaVersion", "contentId", "title"];
  for (const field of requiredFields) {
    if (!(field in metadata)) {
      errors.push({
        code: "MISSING_METADATA_FIELD",
        message: `Required field '${field}' missing from metadata`,
        severity: "high",
        context: { field },
      });
    }
  }

  // Check 2: Schema version compatibility
  const currentVersion = getCurrentSchemaVersion();
  if (metadata.schemaVersion !== currentVersion) {
    warnings.push({
      code: "SCHEMA_VERSION_MISMATCH",
      message: `Metadata schema version (${metadata.schemaVersion}) differs from current (${currentVersion})`,
      suggestion: "Migration may be needed on import",
    });
  }

  // Check 3: Validate schema snapshot accuracy
  if (metadata.schema) {
    const actualNodes = new Set<string>();
    const actualMarks = new Set<string>();

    function traverse(node: JSONContent) {
      if (node.type) actualNodes.add(node.type);
      if (node.marks) {
        node.marks.forEach(m => actualMarks.add(m.type));
      }
      if (node.content) {
        node.content.forEach(traverse);
      }
    }

    traverse(tiptapJson);

    // Check if metadata accurately reflects content
    const declaredNodes = new Set(metadata.schema.nodes);
    const declaredMarks = new Set(metadata.schema.marks);

    // Nodes in content but not in metadata
    for (const node of actualNodes) {
      if (!declaredNodes.has(node)) {
        warnings.push({
          code: "METADATA_SCHEMA_INCOMPLETE",
          message: `Node type '${node}' used in content but not listed in metadata.schema.nodes`,
          suggestion: "Metadata snapshot may be outdated",
        });
      }
    }

    // Marks in content but not in metadata
    for (const mark of actualMarks) {
      if (!declaredMarks.has(mark)) {
        warnings.push({
          code: "METADATA_SCHEMA_INCOMPLETE",
          message: `Mark type '${mark}' used in content but not listed in metadata.schema.marks`,
          suggestion: "Metadata snapshot may be outdated",
        });
      }
    }
  }

  // Check 4: Validate references
  if (metadata.tags && metadata.tags.length > 0) {
    metadata.tags.forEach((tag, idx) => {
      if (!tag.id || !tag.name) {
        errors.push({
          code: "INVALID_TAG_REFERENCE",
          message: `Tag at index ${idx} missing required fields`,
          severity: "medium",
          context: { tag },
        });
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate export result
 *
 * Ensures conversion produced valid output
 */
export function validateExportResult(
  result: { success: boolean; files: Array<{ content: any; name: string }> }
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check 1: Export succeeded
  if (!result.success) {
    errors.push({
      code: "EXPORT_FAILED",
      message: "Export operation marked as failed",
      severity: "critical",
    });
  }

  // Check 2: Files generated
  if (!result.files || result.files.length === 0) {
    errors.push({
      code: "NO_FILES_GENERATED",
      message: "Export produced no files",
      severity: "critical",
    });
    return { valid: false, errors, warnings };
  }

  // Check 3: File content validation
  for (const file of result.files) {
    if (!file.content) {
      errors.push({
        code: "EMPTY_FILE",
        message: `File '${file.name}' has no content`,
        severity: "high",
        context: { fileName: file.name },
      });
    }

    // Check file-specific requirements
    if (file.name.endsWith(".md")) {
      const content = file.content as string;
      if (content.trim().length === 0) {
        errors.push({
          code: "EMPTY_MARKDOWN",
          message: "Markdown file is empty",
          severity: "medium",
          context: { fileName: file.name },
        });
      }

      // Check for malformed syntax
      const unclosedCodeBlocks = (content.match(/```/g) || []).length % 2;
      if (unclosedCodeBlocks !== 0) {
        warnings.push({
          code: "UNCLOSED_CODE_BLOCK",
          message: "Markdown may have unclosed code blocks",
          suggestion: "Verify code block syntax",
        });
      }
    }

    if (file.name.endsWith(".meta.json")) {
      try {
        const metadata = JSON.parse(file.content as string);

        if (!metadata.schemaVersion) {
          warnings.push({
            code: "MISSING_SCHEMA_VERSION",
            message: "Metadata file missing schemaVersion field",
            suggestion: "Add schemaVersion to track compatibility",
          });
        }
      } catch (error) {
        errors.push({
          code: "INVALID_JSON",
          message: `Metadata file '${file.name}' is not valid JSON`,
          severity: "high",
          context: { error: error instanceof Error ? error.message : "Unknown" },
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Comprehensive validation pipeline
 *
 * Run before export to catch all issues
 */
export function validateBeforeExport(
  tiptapJson: JSONContent,
  metadata?: MetadataSidecar
): ValidationResult {
  const results: ValidationResult[] = [];

  // Validate TipTap JSON
  results.push(validateTipTapJSON(tiptapJson));

  // Validate metadata if provided
  if (metadata) {
    results.push(validateMetadata(metadata, tiptapJson));
  }

  // Combine results
  return {
    valid: results.every(r => r.valid),
    errors: results.flatMap(r => r.errors),
    warnings: results.flatMap(r => r.warnings),
    metadata: {
      checkedAt: new Date().toISOString(),
      schemaVersion: getCurrentSchemaVersion(),
    },
  };
}

/**
 * Get required attributes for a node type
 */
function getRequiredAttributes(nodeType?: string): string[] {
  const requirements: Record<string, string[]> = {
    heading: ["level"],
    codeBlock: ["language"],
    wikiLink: ["targetTitle"],
    tag: ["tagId", "tagName"],
    callout: ["type"],
  };

  return requirements[nodeType || ""] || [];
}

/**
 * Format validation result for logging
 */
export function formatValidationResult(result: ValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push("✅ Validation passed");
  } else {
    lines.push("❌ Validation failed");
  }

  if (result.errors.length > 0) {
    lines.push("");
    lines.push("Errors:");
    result.errors.forEach(err => {
      lines.push(`  [${err.severity.toUpperCase()}] ${err.code}: ${err.message}`);
      if (err.context) {
        lines.push(`    Context: ${JSON.stringify(err.context)}`);
      }
    });
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    result.warnings.forEach(warn => {
      lines.push(`  [WARN] ${warn.code}: ${warn.message}`);
      if (warn.suggestion) {
        lines.push(`    Suggestion: ${warn.suggestion}`);
      }
    });
  }

  return lines.join("\n");
}
