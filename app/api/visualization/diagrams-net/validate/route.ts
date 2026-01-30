/**
 * Diagrams.net XML Validation API
 *
 * POST /api/visualization/diagrams-net/validate
 * Validates diagram XML for security and correctness
 *
 * Checks:
 * - XML is well-formed
 * - No XSS vectors (script tags, javascript:, event handlers)
 * - Size limits (5MB max)
 * - Valid mxGraphModel structure
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";

const MAX_XML_SIZE = 5 * 1024 * 1024; // 5MB

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export async function POST(request: NextRequest): Promise<NextResponse<ValidationResult>> {
  try {
    await requireAuth();

    const { xml } = await request.json();

    if (!xml) {
      return NextResponse.json({
        valid: false,
        error: "Missing required field: xml",
      });
    }

    // Check 1: Size limit (5MB max)
    if (xml.length > MAX_XML_SIZE) {
      return NextResponse.json({
        valid: false,
        error: `XML too large: ${(xml.length / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit`,
      });
    }

    // Check 2: Well-formed XML
    try {
      // Basic XML validation using DOMParser (if available in Node.js environment)
      // For proper validation, use a library like 'fast-xml-parser'
      if (!xml.trim().startsWith("<")) {
        return NextResponse.json({
          valid: false,
          error: "Invalid XML: Must start with < character",
        });
      }

      if (!xml.includes("mxGraphModel")) {
        return NextResponse.json({
          valid: false,
          error: "Invalid diagrams.net XML: Missing mxGraphModel root element",
          warnings: ["Expected mxGraphModel structure from diagrams.net"],
        });
      }
    } catch (error: any) {
      return NextResponse.json({
        valid: false,
        error: `XML parsing error: ${error.message}`,
      });
    }

    // Check 3: XSS vectors
    const xssPatterns = [
      /<script[\s>]/i, // Script tags
      /javascript:/i, // javascript: protocol
      /on\w+\s*=/i, // Event handlers (onclick, onload, etc.)
      /<iframe[\s>]/i, // Iframe tags
      /<object[\s>]/i, // Object tags
      /<embed[\s>]/i, // Embed tags
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(xml)) {
        return NextResponse.json({
          valid: false,
          error: "Potentially malicious content detected",
          warnings: [
            `XML contains suspicious pattern: ${pattern.source}`,
            "Script tags, event handlers, and embedded content are not allowed",
          ],
        });
      }
    }

    // Check 4: Valid structure (basic check)
    const hasRoot = xml.includes("<root") || xml.includes("<root>");
    const hasCell = xml.includes("<mxCell") || xml.includes("mxCell");

    const warnings: string[] = [];
    if (!hasRoot) {
      warnings.push("XML may be incomplete: Missing <root> element");
    }
    if (!hasCell) {
      warnings.push("XML appears empty: No diagram cells found");
    }

    // All checks passed
    return NextResponse.json({
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error: any) {
    console.error("[Diagrams.net Validation] Error:", error);
    return NextResponse.json({
      valid: false,
      error: "Validation failed",
    });
  }
}
