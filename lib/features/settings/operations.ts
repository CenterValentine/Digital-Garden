/**
 * User Settings Utilities
 *
 * Helper functions for reading, writing, and managing user settings in the database.
 */

import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import {
  userSettingsSchema,
  DEFAULT_SETTINGS,
  type UserSettings,
} from "./validation";
import { deepMerge } from "@/lib/core/deep-merge";
import { logger } from "@/lib/core/logger";

/**
 * Get user settings from database
 * Returns defaults if not set or on error
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { settings: true, settingsVersion: true },
    });

    if (!user?.settings) {
      return DEFAULT_SETTINGS;
    }

    // Validate and merge with defaults
    const validated = userSettingsSchema.parse(user.settings);
    return mergeWithDefaults(validated);
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "settings_read:caught",
      summary: "settings read failed, falling back to defaults",
      error,
    });
    return DEFAULT_SETTINGS;
  }
}

/**
 * Update user settings (partial update)
 * Merges with existing settings
 */
export async function updateUserSettings(
  userId: string,
  updates: Partial<UserSettings>
): Promise<UserSettings> {
  try {
    // Get current settings
    const current = await getUserSettings(userId);

    // Deep merge updates
    const updated = deepMerge(current, updates);

    // Validate
    const validated = userSettingsSchema.parse(updated);

    // Previously logged the full user/current/updated/validated payload —
    // dropped to avoid leaking user settings through stdout. The settings
    // write outcome is captured by the caller's content:settings_update span.

    // Save to database
    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: validated as unknown as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });

    return validated;
  } catch (error) {
    logger.error({
      layer: "content",
      event: "settings_update:caught",
      summary: "settings update failed",
      error,
    });
    throw new Error("Failed to update settings");
  }
}

/**
 * Reset settings to defaults
 */
export async function resetUserSettings(
  userId: string
): Promise<UserSettings> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: DEFAULT_SETTINGS as unknown as Prisma.InputJsonValue,
        settingsVersion: 1,
        updatedAt: new Date(),
      },
    });
    return DEFAULT_SETTINGS;
  } catch (error) {
    logger.error({
      layer: "content",
      event: "settings_reset:caught",
      summary: "settings reset failed",
      error,
    });
    throw new Error("Failed to reset settings");
  }
}

/**
 * Merge with defaults (for missing keys)
 */
function mergeWithDefaults(settings: UserSettings): UserSettings {
  return deepMerge(DEFAULT_SETTINGS, settings);
}

/**
 * Export settings as JSON
 */
export async function exportUserSettings(userId: string): Promise<string> {
  const settings = await getUserSettings(userId);
  return JSON.stringify(settings, null, 2);
}

/**
 * Import settings from JSON
 */
export async function importUserSettings(
  userId: string,
  jsonString: string
): Promise<UserSettings> {
  try {
    const parsed = JSON.parse(jsonString);
    const validated = userSettingsSchema.parse(parsed);
    return await updateUserSettings(userId, validated);
  } catch (error) {
    logger.warn({
      layer: "content",
      event: "settings_import:caught",
      summary: "settings import failed (invalid JSON or schema)",
      error,
    });
    throw new Error("Failed to import settings: Invalid JSON or schema");
  }
}
