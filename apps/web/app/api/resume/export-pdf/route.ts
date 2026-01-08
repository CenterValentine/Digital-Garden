import { NextRequest, NextResponse } from "next/server";
import type { ResumeData, PDFExportOptions } from "@/lib/resume/types";
import { generatePDFHTML } from "@/lib/resume/pdf-generator";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { resumeData, options }: { resumeData: ResumeData; options: PDFExportOptions } = body;

    // Generate HTML content
    const htmlContent = generatePDFHTML(resumeData, options);

    // Read the template
    const templatePath = path.join(
      process.cwd(),
      "app/resume/beta/1/templates/pdf-template.html"
    );
    let template = fs.readFileSync(templatePath, "utf-8");

    // Inject content
    template = template.replace(
      '<div id="resume-content"></div>',
      `<div id="resume-content">${htmlContent}</div>`
    );

    // Try to use Puppeteer if available, otherwise fall back to HTML
    try {
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent(template, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: options.pageSize || "A4",
        margin: options.margins || {
          top: "0.5in",
          right: "0.5in",
          bottom: "0.5in",
          left: "0.5in",
        },
        printBackground: false, // ATS-friendly
      });

      await browser.close();

      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="resume.pdf"`,
        },
      });
    } catch (puppeteerError) {
      // If Puppeteer is not installed, return helpful error
      if (
        puppeteerError instanceof Error &&
        (puppeteerError.message.includes("Cannot find module") ||
          puppeteerError.message.includes("puppeteer"))
      ) {
        console.error("Puppeteer not installed. Install with: pnpm add puppeteer");
        return NextResponse.json(
          {
            error:
              "PDF generation requires Puppeteer. Please install it with: pnpm add puppeteer",
          },
          { status: 500 }
        );
      }

      // Other Puppeteer errors
      console.error("Puppeteer error:", puppeteerError);
      return NextResponse.json(
        { error: "Failed to generate PDF with Puppeteer" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

