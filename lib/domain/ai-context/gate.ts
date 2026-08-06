/**
 * Folder-mention freshness gate (FOLDER-CONTEXT-CAPSULE-PLAN → D4/D5).
 *
 * CODE decides freshness, not the model: before a capsule is injected, the
 * gate checks coverage for the folder + its direct children and drains the
 * engine until fresh or the time budget expires. A mention is EXPLICIT human
 * demand, so the drain bypasses the 10-minute settle debounce (sweep B9) and
 * ignores the autoContextMode auto-refresh preference — same class as the
 * Generate button.
 *
 * Failure ladder (D5):
 *   fresh  — coverage clean, capsule is current
 *   stale  — refresh could not complete (budget / provider / spend ceiling /
 *            claim contention) but SOME context exists; serve it flagged
 *   none   — nothing usable exists at all; the mention must fail visibly
 *   optedOut — resolved OPT_OUT; mention degrades to name-only
 *
 * SERVER-ONLY (Prisma).
 */

import { prisma } from "@/lib/database/client";
import { ContextMode } from "@/lib/database/generated/prisma";
import { refreshScope } from "./context-refresh";
import { explicitMode, resolveContextMode } from "./mode-resolve";

export type GateStatus = "fresh" | "stale" | "none" | "optedOut";

export interface GateResult {
  status: GateStatus;
  /** LLM calls spent by drains this gate ran (for the chip + durable trace). */
  generationCalls: number;
  /** Nodes whose sections actually changed across this gate's drains. */
  refreshedNodes: number;
  /** Why the ladder stopped where it did (chip detail + trace line). */
  reason?: "budget" | "spendCeiling" | "unconfigured" | "claimContention" | "error";
  waitedMs: number;
}

export interface GateOptions {
  /** Wall-clock budget before degrading to the stale rung. */
  budgetMs?: number;
}

const DEFAULT_BUDGET_MS = 4500;
/** Recheck cadence while another instance holds the refresh claim. */
const CONTENTION_POLL_MS = 300;
/** Hard cap on drain invocations inside one gate (belt for the budget). */
const MAX_DRAINS = 6;

interface Coverage {
  /** Dirty or uncovered work remains in the depth-1 scope. */
  clean: boolean;
  /** At least one row with generated content exists (folder or child). */
  anyCovered: boolean;
}

async function checkCoverage(
  userId: string,
  folderId: string,
  resolvedMode: ContextMode
): Promise<Coverage> {
  const [folder, children] = await Promise.all([
    prisma.contentNode.findFirst({
      where: { id: folderId, ownerId: userId, deletedAt: null },
      select: {
        agenticMetadata: {
          select: { generatedAt: true, contextDirty: true },
        },
      },
    }),
    prisma.contentNode.findMany({
      where: { parentId: folderId, deletedAt: null },
      select: {
        contentType: true,
        agenticMetadata: {
          select: {
            generatedAt: true,
            contextDirty: true,
            contextMode: true,
            contextOptOut: true,
          },
        },
      },
    }),
  ]);

  const visible = children.filter(
    (c) => explicitMode(c.agenticMetadata) !== ContextMode.OPT_OUT
  );

  let dirtyOrUncovered = 0;
  let anyCovered = !!folder?.agenticMetadata?.generatedAt;
  for (const child of visible) {
    const am = child.agenticMetadata;
    if (am?.generatedAt) anyCovered = true;
    if (!am?.generatedAt || am.contextDirty) dirtyOrUncovered += 1;
  }

  // REFERENCE folders have no roll-up work class: the folder's own row not
  // being generated is not staleness (plan D6). Children still need
  // one-liners, so their coverage counts as usual.
  if (resolvedMode !== ContextMode.REFERENCE) {
    const am = folder?.agenticMetadata;
    if (!am?.generatedAt || am.contextDirty) dirtyOrUncovered += 1;
  }

  return { clean: dirtyOrUncovered === 0, anyCovered };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function ensureFolderContextFresh(
  userId: string,
  folderId: string,
  options: GateOptions = {}
): Promise<GateResult> {
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const result: GateResult = {
    status: "none",
    generationCalls: 0,
    refreshedNodes: 0,
    waitedMs: 0,
  };
  const finish = (status: GateStatus, reason?: GateResult["reason"]) => {
    result.status = status;
    result.reason = reason;
    result.waitedMs = Date.now() - startedAt;
    return result;
  };

  const resolvedMode = await resolveContextMode(folderId);
  if (resolvedMode === ContextMode.OPT_OUT) return finish("optedOut");

  let coverage = await checkCoverage(userId, folderId, resolvedMode);
  if (coverage.clean) return finish("fresh");

  let reason: GateResult["reason"];
  for (let drain = 0; drain < MAX_DRAINS; drain += 1) {
    if (Date.now() - startedAt >= budgetMs) {
      reason = "budget";
      break;
    }
    try {
      // B9: bypassSettle — a mention is explicit demand, not background work.
      const outcome = await refreshScope(userId, folderId, {
        bypassSettle: true,
      });
      if (outcome.status === "ran") {
        result.generationCalls += outcome.stats.generationCalls;
        result.refreshedNodes +=
          outcome.stats.leavesRefreshed + outcome.stats.foldersRefreshed;
        coverage = await checkCoverage(userId, folderId, resolvedMode);
        if (coverage.clean) return finish("fresh");
        if (outcome.stats.budgetStopped) {
          reason = "spendCeiling";
          break;
        }
        // Capped drain with work remaining: loop for another bounded drain.
        continue;
      }
      if (outcome.status === "skipped") {
        // Another instance holds the claim (B2) — poll coverage until it
        // finishes or the budget expires.
        reason = "claimContention";
        await sleep(CONTENTION_POLL_MS);
        coverage = await checkCoverage(userId, folderId, resolvedMode);
        if (coverage.clean) return finish("fresh");
        continue;
      }
      if (outcome.status === "budgetExhausted") {
        reason = "spendCeiling";
        break;
      }
      if (outcome.status === "unconfigured") {
        reason = "unconfigured";
        break;
      }
      // "off" never happens here (refreshScope doesn't mode-gate), but any
      // unknown outcome degrades honestly rather than spinning.
      break;
    } catch {
      reason = "error";
      break;
    }
  }

  coverage = await checkCoverage(userId, folderId, resolvedMode);
  if (coverage.clean) return finish("fresh");
  return finish(coverage.anyCovered ? "stale" : "none", reason ?? "budget");
}
