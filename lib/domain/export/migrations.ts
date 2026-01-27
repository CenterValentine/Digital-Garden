/**
 * Schema Migration System
 *
 * Handles backward compatibility when importing old exports
 * with different schema versions
 */

import type { JSONContent } from "@tiptap/core";
import type { MetadataSidecar } from "./metadata";
import { getCurrentSchemaVersion, getChangesBetween } from "@/lib/domain/editor/schema-version";

export interface SchemaMigration {
  fromVersion: string;
  toVersion: string;
  description: string;
  breaking: boolean;
  migrateMetadata: (metadata: MetadataSidecar) => MetadataSidecar;
  migrateTiptapJSON: (json: JSONContent) => JSONContent;
}

/**
 * Registry of all schema migrations
 *
 * Add new migrations here when making breaking changes
 */
export const MIGRATIONS: SchemaMigration[] = [
  // Example migration (template for future use):
  // {
  //   fromVersion: "1.0.0",
  //   toVersion: "2.0.0",
  //   description: "Renamed 'internalLink' to 'wikiLink'",
  //   breaking: true,
  //
  //   migrateMetadata(metadata) {
  //     // Update schema snapshot
  //     if (metadata.schema?.nodes?.includes("internalLink")) {
  //       metadata.schema.nodes = metadata.schema.nodes.map(n =>
  //         n === "internalLink" ? "wikiLink" : n
  //       );
  //     }
  //
  //     // Update extensions list
  //     if (metadata.schema?.extensions?.includes("InternalLink")) {
  //       metadata.schema.extensions = metadata.schema.extensions.map(e =>
  //         e === "InternalLink" ? "WikiLink" : e
  //       );
  //     }
  //
  //     return metadata;
  //   },
  //
  //   migrateTiptapJSON(json) {
  //     // Recursively rename node types
  //     function migrate(node: JSONContent): JSONContent {
  //       if (node.type === "internalLink") {
  //         return {
  //           ...node,
  //           type: "wikiLink",
  //         };
  //       }
  //
  //       if (node.content) {
  //         return {
  //           ...node,
  //           content: node.content.map(migrate),
  //         };
  //       }
  //
  //       return node;
  //     }
  //
  //     return migrate(json);
  //   },
  // },
];

/**
 * Apply all required migrations to bring old export to current schema
 *
 * @param tiptapJson - TipTap JSON from old export
 * @param metadata - Metadata sidecar from old export
 * @returns Migrated TipTap JSON and metadata
 */
export function applyMigrations(
  tiptapJson: JSONContent,
  metadata: MetadataSidecar
): { tiptapJson: JSONContent; metadata: MetadataSidecar } {
  const fromVersion = metadata.schemaVersion || "1.0.0";
  const toVersion = getCurrentSchemaVersion();

  // If versions match, no migration needed
  if (fromVersion === toVersion) {
    return { tiptapJson, metadata };
  }

  console.log(`[Migration] Upgrading from ${fromVersion} to ${toVersion}`);

  // Get changes between versions
  const changes = getChangesBetween(fromVersion, toVersion);
  const breakingChanges = changes.filter(c => c.breaking);

  if (breakingChanges.length > 0) {
    console.log(
      `[Migration] Found ${breakingChanges.length} breaking changes:`,
      breakingChanges.map(c => c.name)
    );
  }

  // Apply migrations in sequence
  let currentVersion = fromVersion;
  let migratedJSON = tiptapJson;
  let migratedMetadata = metadata;

  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === currentVersion) {
      console.log(`[Migration] Applying: ${migration.description}`);

      migratedJSON = migration.migrateTiptapJSON(migratedJSON);
      migratedMetadata = migration.migrateMetadata(migratedMetadata);

      currentVersion = migration.toVersion;
    }
  }

  // Update schema version in metadata
  migratedMetadata = {
    ...migratedMetadata,
    schemaVersion: toVersion,
  };

  console.log(`[Migration] Complete. Schema now at ${toVersion}`);

  return { tiptapJson: migratedJSON, metadata: migratedMetadata };
}

/**
 * Check if a migration path exists between two versions
 */
export function hasMigrationPath(
  fromVersion: string,
  toVersion: string
): boolean {
  let currentVersion = fromVersion;

  // Try to find migration path
  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === currentVersion) {
      currentVersion = migration.toVersion;

      if (currentVersion === toVersion) {
        return true;
      }
    }
  }

  // If we can't find explicit migrations, check if compatible
  const [fromMajor] = fromVersion.split(".").map(Number);
  const [toMajor] = toVersion.split(".").map(Number);

  return fromMajor === toMajor;
}

/**
 * Get migration path description
 */
export function getMigrationPath(
  fromVersion: string,
  toVersion: string
): string[] {
  const path: string[] = [];
  let currentVersion = fromVersion;

  for (const migration of MIGRATIONS) {
    if (migration.fromVersion === currentVersion) {
      path.push(`${migration.fromVersion} → ${migration.toVersion}: ${migration.description}`);
      currentVersion = migration.toVersion;

      if (currentVersion === toVersion) {
        break;
      }
    }
  }

  return path;
}
