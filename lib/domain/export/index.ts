/**
 * Export Module
 *
 * Multi-format document conversion and bulk export system
 */

// Types
export type {
  ExportFormat,
  MarkdownExportSettings,
  HTMLExportSettings,
  PDFExportSettings,
  AutoBackupSettings,
  BulkExportSettings,
  ExportBackupSettings,
  ConversionOptions,
  ConversionResult,
  DocumentConverter,
  BulkExportFilters,
  BulkExportOptions,
} from "./types";

export { DEFAULT_EXPORT_BACKUP_SETTINGS } from "./types";

// Factory
export { getConverter, convertDocument } from "./factory";

// Bulk export
export { exportVault, exportSingleDocument } from "./bulk-export";

// Metadata utilities
export {
  generateMetadataSidecar,
  extractWikiLinksFromTipTap,
  extractCalloutsFromTipTap,
  extractTagsFromTipTap,
  extractSchemaSnapshot,
} from "./metadata";

// Validation
export {
  validateTipTapJSON,
  validateMetadata,
  validateExportResult,
  validateBeforeExport,
  formatValidationResult,
} from "./validation";
export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./validation";

// Error monitoring
export {
  errorMonitor,
  logExportError,
  checkExportHealth,
} from "./error-monitoring";
export type {
  ExportErrorLog,
  DiscrepancyReport,
} from "./error-monitoring";

// Schema versioning
export {
  getCurrentSchemaVersion,
  isCompatibleVersion,
  getRequiredMigrations,
  getCurrentSchemaSnapshot,
} from "../editor/schema-version";

// Migrations
export {
  applyMigrations,
  hasMigrationPath,
  getMigrationPath,
} from "./migrations";
export type {
  SchemaMigration,
} from "./migrations";
