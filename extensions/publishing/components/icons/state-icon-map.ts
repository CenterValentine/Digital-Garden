import {
  PencilLine,
  CheckCircle2,
  Clock,
  EyeOff,
  Archive,
  CircleDashed,
  TriangleAlert,
  OctagonAlert,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PublishState, ValidationStatus } from "@/lib/database/generated/prisma";

export interface StateIconConfig {
  Icon: LucideIcon;
  color: string;
  label: string;
}

export const PUBLISH_STATE_ICON: Record<PublishState, StateIconConfig> = {
  draft: {
    Icon: PencilLine,
    color: "text-zinc-400",
    label: "Draft",
  },
  published: {
    Icon: CheckCircle2,
    color: "text-emerald-500",
    label: "Published",
  },
  scheduled: {
    Icon: Clock,
    color: "text-sky-500",
    label: "Scheduled",
  },
  unpublished: {
    Icon: EyeOff,
    color: "text-amber-500",
    label: "Unpublished",
  },
  archived: {
    Icon: Archive,
    color: "text-zinc-500",
    label: "Archived",
  },
};

export const PENDING_CHANGES_ICON: StateIconConfig = {
  Icon: CircleDashed,
  color: "text-amber-400",
  label: "Pending changes",
};

export const VALIDATION_ICON: Record<ValidationStatus, StateIconConfig | null> = {
  unchecked: null,
  ok: null,
  warnings: {
    Icon: TriangleAlert,
    color: "text-amber-500",
    label: "Validation warnings",
  },
  blocked: {
    Icon: OctagonAlert,
    color: "text-rose-500",
    label: "Validation errors — cannot publish",
  },
};
