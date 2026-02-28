/**
 * User Settings Validation Schemas
 *
 * Zod schemas for validating user settings stored in User.settings JSONB field.
 * All fields are optional to support partial updates.
 */

import { z } from "zod";

// UI Settings Schema
const uiSettingsSchema = z
  .object({
    theme: z.enum(["light", "dark", "system"]).optional(),
    fontSize: z.number().min(10).max(24).optional(),
    panelLayout: z
      .object({
        leftSidebarWidth: z.number().min(200).max(600).optional(),
        leftSidebarVisible: z.boolean().optional(),
        rightSidebarWidth: z.number().min(200).max(600).optional(),
        rightSidebarVisible: z.boolean().optional(),
        rightSidebarActiveTab: z.string().optional(),
        statusBarVisible: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

// File Settings Schema
const fileSettingsSchema = z
  .object({
    uploadMode: z.enum(["automatic", "manual"]).optional(),
    officeViewerMode: z
      .enum(["google-docs", "onlyoffice", "microsoft-viewer"])
      .optional(),
    onlyofficeServerUrl: z.string().url().nullable().optional(),
  })
  .optional();

// Search Settings Schema
const searchSettingsSchema = z
  .object({
    caseSensitive: z.boolean().optional(),
    useRegex: z.boolean().optional(),
    defaultFilters: z.array(z.string()).optional(),
  })
  .optional();

// Editor Settings Schema
const editorSettingsSchema = z
  .object({
    autoSave: z.boolean().optional(),
    autoSaveDelay: z.number().min(1000).max(10000).optional(),
    spellCheck: z.boolean().optional(),
    wordWrap: z.boolean().optional(),
  })
  .optional();

// File Tree Settings Schema (Phase 2)
const fileTreeSettingsSchema = z
  .object({
    defaultFolderViewMode: z
      .enum(["list", "gallery", "kanban", "dashboard", "canvas"])
      .optional(),
    defaultFolderSortMode: z.enum(["asc", "desc", "manual"]).optional(),
    showFileExtensions: z.boolean().optional(),
    compactMode: z.boolean().optional(),
  })
  .optional();

// External Link Settings Schema (Phase 2)
const externalSettingsSchema = z
  .object({
    previewsEnabled: z.boolean().optional(), // Enable Open Graph previews
    allowAllDomains: z.boolean().optional(), // Allow all domains (bypass allowlist)
    allowlistedHosts: z.array(z.string()).optional(), // Hostnames allowed for preview fetching
    allowHttp: z.boolean().optional(), // Allow HTTP URLs (default: HTTPS-only)
  })
  .optional();

// AI Settings Schema (Epoch 7: AI Integration)
const aiSettingsSchema = z
  .object({
    // Master switch
    enabled: z.boolean().optional(),
    // Provider & model selection
    providerId: z.enum(["anthropic", "openai"]).optional(),
    modelId: z.string().optional(),
    // Legacy field (kept for backward compat, prefer providerId + modelId)
    model: z
      .enum(["claude-opus-4", "claude-sonnet-3-5", "gpt-4"])
      .optional(),
    // Generation parameters
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(200_000).optional(),
    streamingEnabled: z.boolean().optional(),
    // Conversation behavior
    conversationHistory: z.boolean().optional(),
    contextWindow: z.number().optional(),
    // Usage tracking
    monthlyTokenQuota: z.number().optional(),
    tokensUsedThisMonth: z.number().optional(),
    // Feature toggles
    autoSuggest: z.boolean().optional(),
    privacyMode: z.enum(["full", "minimal", "none"]).optional(),
  })
  .optional();

// Export & Backup Settings Schema
const exportBackupSettingsSchema = z
  .object({
    defaultFormat: z
      .enum(["markdown", "html", "pdf", "docx", "json", "txt"])
      .optional(),
    markdown: z
      .object({
        includeMetadata: z.boolean().optional(),
        includeFrontmatter: z.boolean().optional(),
        preserveSemantics: z.boolean().optional(),
        wikiLinkStyle: z.enum(["[[]]", "[]()"]).optional(),
        codeBlockLanguagePrefix: z.boolean().optional(),
      })
      .optional(),
    html: z
      .object({
        standalone: z.boolean().optional(),
        includeCSS: z.boolean().optional(),
        theme: z.enum(["light", "dark", "auto"]).optional(),
        syntaxHighlight: z.boolean().optional(),
      })
      .optional(),
    pdf: z
      .object({
        pageSize: z.enum(["A4", "Letter", "Legal"]).optional(),
        margins: z
          .object({
            top: z.number().optional(),
            right: z.number().optional(),
            bottom: z.number().optional(),
            left: z.number().optional(),
          })
          .optional(),
        headerFooter: z.boolean().optional(),
        includeTableOfContents: z.boolean().optional(),
        colorScheme: z.enum(["color", "grayscale"]).optional(),
      })
      .optional(),
    autoBackup: z
      .object({
        enabled: z.boolean().optional(),
        frequency: z
          .enum(["daily", "weekly", "monthly", "manual"])
          .optional(),
        formats: z
          .array(z.enum(["markdown", "html", "pdf", "docx", "json", "txt"]))
          .optional(),
        storageProvider: z.enum(["r2", "s3", "vercel", "local"]).optional(),
        includeDeleted: z.boolean().optional(),
        maxBackups: z.number().min(1).max(100).optional(),
        lastBackupAt: z.string().nullable().optional(),
      })
      .optional(),
    bulkExport: z
      .object({
        batchSize: z.number().min(10).max(500).optional(),
        compressionFormat: z.enum(["zip", "tar.gz", "none"]).optional(),
        includeStructure: z.boolean().optional(),
        fileNaming: z.enum(["slug", "title", "id"]).optional(),
      })
      .optional(),
  })
  .optional();

// Complete Settings Schema
export const userSettingsSchema = z.object({
  version: z.number().default(1),
  ui: uiSettingsSchema,
  files: fileSettingsSchema,
  fileTree: fileTreeSettingsSchema,
  external: externalSettingsSchema,
  search: searchSettingsSchema,
  editor: editorSettingsSchema,
  ai: aiSettingsSchema,
  exportBackup: exportBackupSettingsSchema,
});

export type UserSettings = z.infer<typeof userSettingsSchema>;

// Default settings (all optional fields filled with sensible defaults)
export const DEFAULT_SETTINGS: UserSettings = {
  version: 1,
  ui: {
    theme: "system",
    fontSize: 14,
    panelLayout: {
      leftSidebarWidth: 200,
      leftSidebarVisible: true,
      rightSidebarWidth: 300,
      rightSidebarVisible: true,
      rightSidebarActiveTab: "backlinks",
      statusBarVisible: true,
    },
  },
  files: {
    uploadMode: "automatic",
    officeViewerMode: "google-docs",
    onlyofficeServerUrl: null,
  },
  fileTree: {
    defaultFolderViewMode: "list",
    defaultFolderSortMode: "manual",
    showFileExtensions: false,
    compactMode: false,
  },
  external: {
    previewsEnabled: false, // Safe default: disabled
    allowAllDomains: false, // Require allowlist by default
    allowlistedHosts: [
      // Popular search engines
      "google.com",
      "*.google.com",
      "bing.com",
      "duckduckgo.com",

      // Social media & communication
      "twitter.com",
      "x.com",
      "linkedin.com",
      "facebook.com",
      "instagram.com",
      "reddit.com",
      "*.reddit.com",

      // Developer resources
      "github.com",
      "*.github.io",
      "gitlab.com",
      "stackoverflow.com",
      "*.stackoverflow.com",
      "npmjs.com",
      "*.npmjs.com",

      // Documentation sites
      "developer.mozilla.org",
      "docs.anthropic.com",
      "*.vercel.app",
      "nextjs.org",
      "reactjs.org",
      "react.dev",
      "nodejs.org",
      "python.org",
      "*.python.org",

      // News & media
      "*.wikipedia.org",
      "medium.com",
      "*.medium.com",
      "youtube.com",
      "*.youtube.com",
      "vimeo.com",

      // Productivity & tools
      "notion.so",
      "*.notion.site",
      "figma.com",
      "miro.com",
      "trello.com",
      "asana.com",
      "slack.com",

      // Cloud & storage
      "dropbox.com",
      "drive.google.com",
      "onedrive.live.com",
    ],
    allowHttp: false, // HTTPS-only by default
  },
  search: {
    caseSensitive: false,
    useRegex: false,
    defaultFilters: [],
  },
  editor: {
    autoSave: true,
    autoSaveDelay: 2000,
    spellCheck: true,
    wordWrap: true,
  },
  ai: {
    enabled: true,
    providerId: "anthropic",
    modelId: "claude-sonnet-3-5",
    model: "claude-sonnet-3-5", // Legacy
    temperature: 0.7,
    maxTokens: 4096,
    streamingEnabled: true,
    conversationHistory: true,
    contextWindow: 4096,
    monthlyTokenQuota: 100000,
    tokensUsedThisMonth: 0,
    autoSuggest: true,
    privacyMode: "full",
  },
  exportBackup: {
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
  },
};
