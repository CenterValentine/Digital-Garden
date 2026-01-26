/**
 * User Settings Utilities
 *
 * Helper functions for reading, writing, and managing user settings in the database.
 */

import { prisma } from "@/lib/db/prisma";
import {
  userSettingsSchema,
  DEFAULT_SETTINGS,
  type UserSettings,
} from "./validation";

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
    console.error("[Settings Utils] Get settings error:", error);
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

    // Save to database
    await prisma.user.update({
      where: { id: userId },
      data: {
        settings: validated as any, // Prisma Json type
        updatedAt: new Date(),
      },
    });

    return validated;
  } catch (error) {
    console.error("[Settings Utils] Update settings error:", error);
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
        settings: DEFAULT_SETTINGS as any,
        settingsVersion: 1,
        updatedAt: new Date(),
      },
    });
    return DEFAULT_SETTINGS;
  } catch (error) {
    console.error("[Settings Utils] Reset settings error:", error);
    throw new Error("Failed to reset settings");
  }
}

/**
 * Deep merge helper
 * Recursively merges source into target
 */
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  if (!target) return source;

  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined && source[key] !== null) {
      if (
        typeof source[key] === "object" &&
        !Array.isArray(source[key]) &&
        typeof target[key] === "object" &&
        !Array.isArray(target[key])
      ) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
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
    console.error("[Settings Utils] Import settings error:", error);
    throw new Error("Failed to import settings: Invalid JSON or schema");
  }
}
