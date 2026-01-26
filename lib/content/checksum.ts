/**
 * File Checksum Utilities
 *
 * Calculate and verify file checksums (SHA-256) for integrity checking
 * and deduplication.
 */

import crypto from "crypto";
import { Readable } from "stream";

// ============================================================
// CHECKSUM CALCULATION
// ============================================================

/**
 * Calculate SHA-256 checksum from buffer
 *
 * @param buffer - File buffer
 * @returns Hex-encoded SHA-256 hash
 */
export function calculateChecksumFromBuffer(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Calculate SHA-256 checksum from stream
 *
 * @param stream - Readable stream
 * @returns Promise<Hex-encoded SHA-256 hash>
 */
export async function calculateChecksumFromStream(
  stream: Readable
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Calculate SHA-256 checksum from File (browser)
 *
 * @param file - File object
 * @returns Promise<Hex-encoded SHA-256 hash>
 */
export async function calculateChecksumFromFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  return calculateChecksumFromBuffer(Buffer.from(buffer));
}

// ============================================================
// CHECKSUM VERIFICATION
// ============================================================

/**
 * Verify file checksum matches expected value
 *
 * @param buffer - File buffer
 * @param expectedChecksum - Expected checksum
 * @returns true if match
 */
export function verifyChecksum(
  buffer: Buffer,
  expectedChecksum: string
): boolean {
  const actualChecksum = calculateChecksumFromBuffer(buffer);
  return actualChecksum === expectedChecksum;
}

/**
 * Verify stream checksum matches expected value
 *
 * @param stream - Readable stream
 * @param expectedChecksum - Expected checksum
 * @returns Promise<true if match>
 */
export async function verifyStreamChecksum(
  stream: Readable,
  expectedChecksum: string
): Promise<boolean> {
  const actualChecksum = await calculateChecksumFromStream(stream);
  return actualChecksum === expectedChecksum;
}

// ============================================================
// DEDUPLICATION
// ============================================================

/**
 * Check if file already exists (by checksum + size)
 *
 * @param checksum - File checksum
 * @param fileSize - File size in bytes
 * @param ownerId - Owner user ID
 * @returns Existing file payload or null
 */
export async function findDuplicateFile(
  checksum: string,
  fileSize: bigint,
  ownerId: string
) {
  const { prisma } = await import("@/lib/db/prisma");

  return prisma.filePayload.findFirst({
    where: {
      checksum,
      fileSize,
      content: {
        ownerId,
      },
      uploadStatus: "ready",
    },
    include: {
      content: true,
    },
  });
}

/**
 * Check if user has uploaded file before (deduplication check)
 *
 * @param checksum - File checksum
 * @param ownerId - Owner user ID
 * @returns true if duplicate exists
 */
export async function isDuplicateUpload(
  checksum: string,
  ownerId: string
): Promise<boolean> {
  const { prisma } = await import("@/lib/db/prisma");

  const count = await prisma.filePayload.count({
    where: {
      checksum,
      content: {
        ownerId,
      },
      uploadStatus: "ready",
    },
  });

  return count > 0;
}

// ============================================================
// INTEGRITY CHECKING
// ============================================================

/**
 * Integrity check result
 */
export interface IntegrityCheckResult {
  contentId: string;
  fileName: string;
  valid: boolean;
  expectedChecksum: string;
  actualChecksum?: string;
  error?: string;
}

/**
 * Verify stored file integrity (periodic maintenance)
 *
 * @param contentId - Content ID
 * @param getFileBuffer - Function to fetch file buffer from storage
 * @returns Integrity check result
 */
export async function verifyFileIntegrity(
  contentId: string,
  getFileBuffer: () => Promise<Buffer>
): Promise<IntegrityCheckResult> {
  const { prisma } = await import("@/lib/db/prisma");

  const filePayload = await prisma.filePayload.findUnique({
    where: { contentId },
  });

  if (!filePayload) {
    return {
      contentId,
      fileName: "unknown",
      valid: false,
      expectedChecksum: "",
      error: "File payload not found",
    };
  }

  try {
    const buffer = await getFileBuffer();
    const actualChecksum = calculateChecksumFromBuffer(buffer);
    const valid = actualChecksum === filePayload.checksum;

    return {
      contentId,
      fileName: filePayload.fileName,
      valid,
      expectedChecksum: filePayload.checksum,
      actualChecksum,
    };
  } catch (error) {
    return {
      contentId,
      fileName: filePayload.fileName,
      valid: false,
      expectedChecksum: filePayload.checksum,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ============================================================
// BATCH INTEGRITY CHECKING
// ============================================================

/**
 * Run integrity checks on all uploaded files (maintenance task)
 *
 * @param ownerId - Optional: check files for specific user
 * @param limit - Maximum files to check per run
 * @returns Array of check results
 */
export async function batchIntegrityCheck(
  ownerId?: string,
  limit: number = 100
): Promise<IntegrityCheckResult[]> {
  const { prisma } = await import("@/lib/db/prisma");

  const files = await prisma.filePayload.findMany({
    where: {
      uploadStatus: "ready",
      content: ownerId ? { ownerId } : undefined,
    },
    take: limit,
    orderBy: {
      updatedAt: "asc", // Check oldest files first
    },
  });

  const results: IntegrityCheckResult[] = [];

  // Note: In production, you'd fetch from actual storage
  // This is a placeholder for the pattern
  for (const file of files) {
    results.push({
      contentId: file.contentId,
      fileName: file.fileName,
      valid: false,
      expectedChecksum: file.checksum,
      error: "Storage fetch not implemented",
    });
  }

  return results;
}
