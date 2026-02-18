/**
 * Diagrams.net Export API
 *
 * POST /api/visualization/diagrams-net/export
 * Converts XML to PNG/SVG/PDF for download
 *
 * Note: Full implementation requires server-side rendering (puppeteer, playwright, or similar)
 * For now, returns placeholder response. Client can use diagrams.net's export feature.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/infrastructure/auth";

export async function POST(request: NextRequest) {
  try {
    await requireAuth();

    const { xml, format, scale = 1 } = await request.json();

    if (!xml || !format) {
      return NextResponse.json(
        { error: "Missing required fields: xml, format" },
        { status: 400 }
      );
    }

    if (!["png", "svg", "pdf"].includes(format)) {
      return NextResponse.json(
        { error: "Invalid format. Must be png, svg, or pdf" },
        { status: 400 }
      );
    }

    // TODO: Implement server-side export using:
    // Option 1: Puppeteer to render diagrams.net iframe and screenshot
    // Option 2: Use diagrams.net's export API if available
    // Option 3: Use draw.io desktop CLI (drawio --export)

    // For now, return error message guiding user to use iframe export
    return NextResponse.json(
      {
        error: "Server-side export not yet implemented",
        message: "Please use the export button within the diagram editor",
        todo: [
          "Install puppeteer: pnpm add puppeteer",
          "Create export service that loads diagrams.net in headless browser",
          "Render and screenshot/export as requested format",
        ],
      },
      { status: 501 } // Not Implemented
    );

    // Future implementation example:
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();
    // await page.goto(`https://embed.diagrams.net/?xml=${encodeURIComponent(xml)}`);
    // const screenshot = await page.screenshot({ type: format === 'png' ? 'png' : 'jpeg' });
    // await browser.close();
    // return new NextResponse(screenshot, {
    //   headers: {
    //     'Content-Type': `image/${format}`,
    //     'Content-Disposition': `attachment; filename="diagram.${format}"`,
    //   },
    // });
  } catch (error: any) {
    console.error("[Diagrams.net Export] Error:", error);
    return NextResponse.json(
      { error: "Export failed", details: error.message },
      { status: 500 }
    );
  }
}
