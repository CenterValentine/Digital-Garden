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

// AI Settings Schema (for M8 Phase 2)
const aiSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    model: z
      .enum(["claude-opus-4", "claude-sonnet-3-5", "gpt-4"])
      .optional(),
    conversationHistory: z.boolean().optional(),
    contextWindow: z.number().optional(),
    monthlyTokenQuota: z.number().optional(),
    tokensUsedThisMonth: z.number().optional(),
    autoSuggest: z.boolean().optional(),
    privacyMode: z.enum(["full", "minimal", "none"]).optional(),
  })
  .optional();

// Complete Settings Schema
export const userSettingsSchema = z.object({
  version: z.number().default(1),
  ui: uiSettingsSchema,
  files: fileSettingsSchema,
  search: searchSettingsSchema,
  editor: editorSettingsSchema,
  ai: aiSettingsSchema,
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
    model: "claude-sonnet-3-5",
    conversationHistory: true,
    contextWindow: 4096,
    monthlyTokenQuota: 100000, // 100k tokens/month for free tier
    tokensUsedThisMonth: 0,
    autoSuggest: true,
    privacyMode: "full",
  },
};
