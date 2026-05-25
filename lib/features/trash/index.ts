/**
 * Trash module — barrel export. Server-only soft-delete TTL + purge.
 */

export {
  TRASH_RETENTION_DAYS,
  listTrash,
  restoreTrashItem,
  purgeTrashItem,
  purgeExpiredTrash,
} from "./service";

export type { TrashItem, TrashItemKind } from "./service";
