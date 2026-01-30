/**
 * Blank Office Document Generator
 *
 * Creates blank .docx and .xlsx files programmatically
 * These files can be uploaded to storage and opened in existing viewers
 *
 * M7+: Office Document Creation
 */

import { Document, Packer, Paragraph, TextRun } from "docx";
import * as XLSX from "xlsx";

/**
 * Generate a blank .docx file
 *
 * Creates a minimal Word document with a single empty paragraph.
 * The document is compatible with all viewers (Google Docs, ONLYOFFICE, mammoth.js)
 *
 * @param fileName - Optional file name to include in document properties
 * @returns Buffer containing the .docx file
 */
export async function generateBlankDocx(fileName?: string): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Single empty paragraph to start
          new Paragraph({
            children: [
              new TextRun({
                text: "",
                // Optional: Add a subtle cursor placeholder
                // text: " ", // Single space for cursor positioning
              }),
            ],
          }),
        ],
      },
    ],
    // Optional document properties
    ...(fileName && {
      title: fileName,
      description: "Created with Digital Garden",
    }),
  });

  // Convert to buffer
  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

/**
 * Generate a blank .xlsx file
 *
 * Creates a minimal Excel workbook with a single empty sheet.
 * The workbook is compatible with all viewers (Google Sheets, ONLYOFFICE)
 *
 * @param fileName - Optional file name (used for sheet name)
 * @returns Buffer containing the .xlsx file
 */
export function generateBlankXlsx(fileName?: string): Buffer {
  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Create an empty worksheet
  const worksheet = XLSX.utils.aoa_to_sheet([
    // Optional: Add header row with a placeholder
    // [""], // Empty cell to start
  ]);

  // Add the worksheet to the workbook
  const sheetName = fileName ? fileName.replace(/\.xlsx$/i, "") : "Sheet1";
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Set workbook properties
  workbook.Props = {
    Title: fileName || "Untitled Spreadsheet",
    Author: "Digital Garden",
    CreatedDate: new Date(),
  };

  // Convert to buffer
  const buffer = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  });

  return Buffer.from(buffer);
}

/**
 * Create blank office document based on file type
 *
 * @param fileType - The type of file to generate ("docx" or "xlsx")
 * @param fileName - Optional file name (without extension required)
 * @returns Buffer containing the generated file
 * @throws Error if file type is not supported
 */
export async function createBlankOfficeDocument(
  fileType: "docx" | "xlsx",
  fileName?: string
): Promise<Buffer> {
  switch (fileType) {
    case "docx":
      return await generateBlankDocx(fileName);
    case "xlsx":
      return generateBlankXlsx(fileName);
    default:
      throw new Error(`Unsupported file type: ${fileType}. Supported types: docx, xlsx`);
  }
}
