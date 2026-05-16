/**
 * Diagrams.net XML Validation API
 *
 * POST /api/visualization/diagrams-net/validate
 * Validates diagram XML for security and correctness
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";
import { logger, withRouteTrace, withSpan } from "@/lib/core/logger";

const ROUTE_PATH = "/api/visualization/diagrams-net/validate";

const MAX_XML_SIZE = 5 * 1024 * 1024; // 5MB

interface ValidationResult {
  valid: boolean;
  error?: string;
  warnings?: string[];
}

export async function POST(request: NextRequest) {
  return withRouteTrace(request, { route: ROUTE_PATH }, async (): Promise<NextResponse<ValidationResult>> => {
    try {
      await withSpan(
        { layer: "auth", name: "session" },
        { summary: "session lookup" },
        async () => requireAuth(),
      );

      const { xml } = await request.json();

      if (!xml) {
        return NextResponse.json({
          valid: false,
          error: "Missing required field: xml",
        });
      }

      if (xml.length > MAX_XML_SIZE) {
        return NextResponse.json({
          valid: false,
          error: `XML too large: ${(xml.length / 1024 / 1024).toFixed(2)}MB exceeds 5MB limit`,
        });
      }

      try {
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
      } catch (error: unknown) {
        return NextResponse.json({
          valid: false,
          error: `XML parsing error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      const xssPatterns = [
        /<script[\s>]/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe[\s>]/i,
        /<object[\s>]/i,
        /<embed[\s>]/i,
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

      const hasRoot = xml.includes("<root") || xml.includes("<root>");
      const hasCell = xml.includes("<mxCell") || xml.includes("mxCell");

      const warnings: string[] = [];
      if (!hasRoot) {
        warnings.push("XML may be incomplete: Missing <root> element");
      }
      if (!hasCell) {
        warnings.push("XML appears empty: No diagram cells found");
      }

      return NextResponse.json({
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      });
    } catch (error: unknown) {
      logger.error({
        layer: "external",
        event: "diagrams_net_validate:caught",
        summary: "validate failed",
        error,
      });
      return NextResponse.json({
        valid: false,
        error: "Validation failed",
      });
    }
  });
}
