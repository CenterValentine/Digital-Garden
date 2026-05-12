"use client";

import { useState } from "react";
import { ExternalLink, MoreHorizontal, Loader2, CalendarClock, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/core/utils";
import {
  PUBLISH_STATE_ICON,
  PENDING_CHANGES_ICON,
  VALIDATION_ICON,
} from "../icons/state-icon-map";
import { canPublish, hasPendingChanges, isBlockedByValidation } from "../../lib/predicates";
import { publishItem, unpublishItem, scheduleItem } from "../../lib/client-api";
import { usePublishStore, type PublishItemSummary } from "../../state/publish-store";

interface PublishItemRowProps {
  item: PublishItemSummary;
  onRefresh: () => void;
}

export function PublishItemRow({ item, onRefresh }: PublishItemRowProps) {
  const [isActing, setIsActing] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduledValue, setScheduledValue] = useState("");
  const { openPrePublishDialog } = usePublishStore();

  const stateIcon = PUBLISH_STATE_ICON[item.state];
  const validationIcon =
    item.validationStatus !== "unchecked" && item.validationStatus !== "ok"
      ? VALIDATION_ICON[item.validationStatus]
      : null;
  const pendingChanges = hasPendingChanges(item);
  const blocked = isBlockedByValidation(item);
  const hasWarnings = item.validationStatus === "warnings";

  async function handlePublish() {
    if (!canPublish(item)) return;
    if (hasWarnings) {
      openPrePublishDialog(item.id);
      return;
    }
    setIsActing(true);
    try {
      await publishItem(item.id);
      toast.success("Published successfully.");
      onRefresh();
    } catch {
      toast.error("Could not publish. Try again.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleUnpublish() {
    setIsActing(true);
    try {
      await unpublishItem(item.id);
      toast.success("Unpublished.");
      onRefresh();
    } catch {
      toast.error("Could not unpublish. Try again.");
    } finally {
      setIsActing(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledValue) return;
    const scheduledFor = new Date(scheduledValue).toISOString();
    const isFuture = new Date(scheduledFor) > new Date();
    setIsActing(true);
    try {
      await scheduleItem(item.id, scheduledFor);
      toast.success(isFuture ? "Scheduled for publish." : "Publish date set.");
      setShowScheduler(false);
      setScheduledValue("");
      onRefresh();
    } catch {
      toast.error("Could not set schedule. Try again.");
    } finally {
      setIsActing(false);
    }
  }

  const viewHref = item.path
    ? `/${item.path.slug}/${item.slug}`
    : `/${item.slug}`;

  return (
    <div className="group flex items-start gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
      {/* State icon */}
      <div className="shrink-0 mt-0.5">
        {pendingChanges && item.state === "published" ? (
          <span title={PENDING_CHANGES_ICON.label}>
            <PENDING_CHANGES_ICON.Icon
              className={cn("w-3.5 h-3.5", PENDING_CHANGES_ICON.color)}
            />
          </span>
        ) : (
          <span title={stateIcon.label}>
            <stateIcon.Icon
              className={cn("w-3.5 h-3.5", stateIcon.color)}
            />
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Title + options button */}
        <div className="flex items-start justify-between gap-1">
          <span className="text-xs text-gray-700 truncate">
            {item.publicTitle ?? item.slug}
          </span>
          {isActing ? (
            <Loader2 className="w-3 h-3 animate-spin text-gray-300 shrink-0" />
          ) : (
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-gray-300 hover:text-gray-500"
              title="More options"
              onClick={() => toast.info("Item options — coming soon")}
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* State label + validation icons */}
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className={cn("text-[10px]", stateIcon.color)}>
            {pendingChanges && item.state === "published"
              ? "Changes pending"
              : stateIcon.label}
          </span>
          {item.scheduledFor && (
            <span className="text-[10px] text-sky-500">
              · {new Date(item.scheduledFor).toLocaleDateString()}
            </span>
          )}
          {validationIcon && (
            <span title={validationIcon.label}>
              <validationIcon.Icon
                className={cn("w-3 h-3 shrink-0", validationIcon.color)}
              />
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap">
          {item.state !== "published" && canPublish(item) && (
            <button
              onClick={handlePublish}
              disabled={isActing || blocked}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors disabled:opacity-40"
            >
              Publish now
            </button>
          )}
          {item.state !== "published" && (
            <button
              onClick={() => { setShowScheduler((v) => !v); setScheduledValue(""); }}
              disabled={isActing}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-sky-500 hover:bg-sky-50 hover:text-sky-600 transition-colors disabled:opacity-40"
            >
              <CalendarClock className="w-2.5 h-2.5" />
              Schedule
            </button>
          )}
          {item.state === "published" && (
            <>
              <button
                onClick={handlePublish}
                disabled={isActing || blocked}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40",
                  pendingChanges
                    ? "text-amber-600 hover:bg-amber-50 hover:text-amber-700"
                    : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                )}
              >
                {pendingChanges ? "Update" : "Re-publish"}
              </button>
              <button
                onClick={handleUnpublish}
                disabled={isActing}
                className="rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-40"
              >
                Unpublish
              </button>
              <a
                href={viewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <ExternalLink className="w-2.5 h-2.5" />
                View
              </a>
            </>
          )}
        </div>

        {/* Inline scheduler */}
        {showScheduler && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={scheduledValue}
              onChange={(e) => setScheduledValue(e.target.value)}
              className="flex-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-700 bg-white focus:outline-none focus:border-sky-400"
            />
            <button
              onClick={handleSchedule}
              disabled={!scheduledValue || isActing}
              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 transition-colors disabled:opacity-40"
            >
              Set
            </button>
            <button
              onClick={() => { setShowScheduler(false); setScheduledValue(""); }}
              className="rounded p-0.5 text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
