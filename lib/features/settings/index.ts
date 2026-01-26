/**
 * Settings Module
 *
 * Centralized user settings management with validation and database operations.
 */

// Validation schemas and types
export {
  userSettingsSchema,
  DEFAULT_SETTINGS,
  type UserSettings,
} from "./validation";

// Database operations
export {
  getUserSettings,
  updateUserSettings,
  resetUserSettings,
  exportUserSettings,
  importUserSettings,
} from "./operations";
