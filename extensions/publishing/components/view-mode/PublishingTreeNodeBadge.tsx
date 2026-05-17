"use client";

interface PublishingTreeNodeBadgeProps {
  count: number;
}

export function PublishingTreeNodeBadge({ count }: PublishingTreeNodeBadgeProps) {
  return (
    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/10 text-white/50 tabular-nums">
      {count > 99 ? "99+" : count}
    </span>
  );
}
