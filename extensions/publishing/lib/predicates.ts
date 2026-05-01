import type { PublishItemSummary } from "../state/publish-store";

export function isLive(item: PublishItemSummary): boolean {
  return item.state === "published";
}

export function canPublish(item: PublishItemSummary): boolean {
  return (
    item.state !== "archived" &&
    item.validationStatus !== "blocked"
  );
}

export function canSchedule(item: PublishItemSummary): boolean {
  return item.state !== "archived" && item.state !== "published";
}

export function hasPendingChanges(item: PublishItemSummary): boolean {
  return item.hasPendingChanges;
}

export function isBlockedByValidation(item: PublishItemSummary): boolean {
  return item.validationStatus === "blocked";
}
