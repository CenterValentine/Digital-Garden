/**
 * Export & Conversion Types
 *
 * Type definitions for multi-format document conversion system
 */

import type { JSONContent } from "@tiptap/core";

/**
 * Supported export formats
 */
export type ExportFormat =
  | "markdown"
  | "html"
  | "pdf"
  | "docx"
  | "json"
  | "txt";

/**
 * Markdown export settings
 */
export interface MarkdownExportSettings {
  /** Include .meta.json sidecar file */
  includeMetadata: boolean;
  /** Add YAML frontmatter */
  includeFrontmatter: boolean;
  /** Preserve semantic info in HTML comments */
  preserveSemantics: boolean;
  /** Wiki-link style: Obsidian [[]] or standard []() */
  wikiLinkStyle: "[[]]" | "[]()"
;
  /** Prefix code blocks with language */
  codeBlockLanguagePrefix: boolean;
}

/**
 * HTML export settings
 */
export interface HTMLExportSettings {
  /** Generate full HTML document vs fragment */
  standalone: boolean;
  /** Include embedded CSS */
  includeCSS: boolean;
  /** Color theme */
  theme: "light" | "dark" | "auto";
  /** Syntax highlighting for code blocks */
  syntaxHighlight: boolean;
}

/**
 * PDF export settings
 */
export interface PDFExportSettings {
  /** Page size */
  pageSize: "A4" | "Letter" | "Legal";
  /** Page margins in pixels */
  margins: { top: number; right: number; bottom: number; left: number };
  /** Include header and footer */
  headerFooter: boolean;
  /** Generate table of contents */
  includeTableOfContents: boolean;
  /** Color scheme */
  colorScheme: "color" | "grayscale";
}

/**
 * Auto backup settings
 */
export interface AutoBackupSettings {
  /** Enable automated backups */
  enabled: boolean;
  /** Backup frequency */
  frequency: "daily" | "weekly" | "monthly" | "manual";
  /** Formats to backup */
  formats: ExportFormat[];
  /** Storage provider for backups */
  storageProvider: "r2" | "s3" | "vercel" | "local";
  /** Include deleted content */
  includeDeleted: boolean;
  /** Maximum backup files to keep */
  maxBackups: number;
  /** Last backup timestamp */
  lastBackupAt: string | null;
}

/**
 * Bulk export settings
 */
export interface BulkExportSettings {
  /** Files per batch */
  batchSize: number;
  /** Archive format */
  compressionFormat: "zip" | "tar.gz" | "none";
  /** Preserve folder hierarchy */
  includeStructure: boolean;
  /** File naming strategy */
  fileNaming: "slug" | "title" | "id";
}

/**
 * Complete export & backup settings
 */
export interface ExportBackupSettings {
  /** Default export format */
  defaultFormat: ExportFormat;
  /** Markdown-specific settings */
  markdown: MarkdownExportSettings;
  /** HTML-specific settings */
  html: HTMLExportSettings;
  /** PDF-specific settings */
  pdf: PDFExportSettings;
  /** Automated backup configuration */
  autoBackup: AutoBackupSettings;
  /** Bulk export configuration */
  bulkExport: BulkExportSettings;
}

/**
 * Conversion options passed to converters
 */
export interface ConversionOptions {
  /** Target format */
  format: ExportFormat;
  /** Export settings */
  settings: ExportBackupSettings;
  /** Optional metadata to include */
  metadata?: {
    includeMetadata?: boolean;
    customMetadata?: Record<string, unknown>;
  };
}

/**
 * Result of a conversion operation
 */
export interface ConversionResult {
  /** Success status */
  success: boolean;
  /** Generated files */
  files: Array<{
    name: string;
    content: Buffer | string;
    mimeType: string;
    size: number;
  }>;
  /** Conversion metadata */
  metadata?: {
    conversionTime: number;
    format: ExportFormat;
    warnings?: string[];
  };
}

/**
 * Document converter interface
 *
 * All format converters implement this interface
 */
export interface DocumentConverter {
  /**
   * Convert TipTap JSON to target format
   */
  convert(
    tiptapJson: JSONContent,
    options: ConversionOptions
  ): Promise<ConversionResult>;
}

/**
 * Bulk export filter options
 */
export interface BulkExportFilters {
  /** Filter by parent folder */
  parentId?: string;
  /** Filter by tags */
  tags?: string[];
  /** Filter by date range */
  dateRange?: { start: Date; end: Date };
  /** Include deleted notes */
  includeDeleted?: boolean;
}

/**
 * Bulk export options
 */
export interface BulkExportOptions {
  /** User ID */
  userId: string;
  /** Target format */
  format: ExportFormat;
  /** Filters */
  filters?: BulkExportFilters;
  /** Export settings */
  settings: ExportBackupSettings;
}

/**
 * Default export & backup settings
 */
export const DEFAULT_EXPORT_BACKUP_SETTINGS: ExportBackupSettings = {
  defaultFormat: "markdown",

  markdown: {
    includeMetadata: true,
    includeFrontmatter: true,
    preserveSemantics: true,
    wikiLinkStyle: "[[]]",
    codeBlockLanguagePrefix: true,
  },

  html: {
    standalone: true,
    includeCSS: true,
    theme: "auto",
    syntaxHighlight: true,
  },

  pdf: {
    pageSize: "A4",
    margins: { top: 72, right: 72, bottom: 72, left: 72 },
    headerFooter: true,
    includeTableOfContents: true,
    colorScheme: "color",
  },

  autoBackup: {
    enabled: false,
    frequency: "weekly",
    formats: ["markdown", "json"],
    storageProvider: "r2",
    includeDeleted: false,
    maxBackups: 30,
    lastBackupAt: null,
  },

  bulkExport: {
    batchSize: 50,
    compressionFormat: "zip",
    includeStructure: true,
    fileNaming: "slug",
  },
};
