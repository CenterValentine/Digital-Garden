/**
 * Studio generation runs — the job execution path (plan → Phase 5).
 *
 * Runs are server-owned: the API route responds as soon as the run record
 * exists and executes the job after the response (Next `after()`), so runs
 * survive tab close; the client polls run state and the inbox gets a
 * notification either way. `promptSnapshot` + `model` persist provenance.
 *
 * WorkflowRun was evaluated for this (plan's decision point) and declined:
 * it requires a WorkflowDefinition FK studio runs don't have. The interim
 * StudioGenerationRun table mirrors the frozen GenerationRun contract.
 *
 * Outputs land in a "Studio outputs" subfolder of the source folder and are
 * GEN-locked as chat/tool sources until their bodyHash diverges from the
 * generation-time hash (human edited ⇒ eligible — the anti-feedback-loop
 * rule).
 *
 * SERVER-ONLY (Prisma + AI SDK).
 */

import { generateObject } from "ai";
import { z } from "zod/v4";
import { prisma } from "@/lib/database/client";
import type { Prisma } from "@/lib/database/generated/prisma";
import { resolvePrimaryRoute } from "@/lib/domain/ai/features/router";
import { resolveChatModelFromConnection } from "@/lib/domain/ai/providers/registry";
import { publishEvent } from "@/lib/domain/notifications/service";
import { generateUniqueSlug } from "@/lib/domain/content/slug";
import { stableHash } from "@/lib/core/stable-hash";
import { logger } from "@/lib/core/logger";
import { getUserSettings } from "@/lib/features/settings";
import { getStudioSettings } from "../settings";
import { getStudioToolById } from "../registry";
import { StudioModelUnavailableError } from "@/lib/domain/ai-context/metadata";
import { getSelectionState } from "./source-selection";
import { createSourceContentResolver } from "@/lib/domain/ai-context/source-resolver";

export const STUDIO_OUTPUTS_FOLDER_TITLE = "Studio outputs";

// ── Run listing / DTO ─────────────────────────────────────────────────────

export interface RunDto {
  id: string;
  toolId: string;
  variantId: string | null;
  folderId: string;
  status: string;
  stepIndex: number;
  stepTotal: number;
  stepLabel: string;
  outputNodeId: string | null;
  outputTitle: string | null;
  outputContentType: string | null;
  error: string | null;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export async function listRuns(
  userId: string,
  folderId: string,
  limit = 10
): Promise<RunDto[]> {
  const runs = await prisma.studioGenerationRun.findMany({
    where: { ownerId: userId, folderId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const outputIds = runs
    .map((r) => r.outputNodeId)
    .filter((id): id is string => id !== null);
  const outputs = outputIds.length
    ? await prisma.contentNode.findMany({
        where: { id: { in: outputIds }, deletedAt: null },
        select: { id: true, title: true, contentType: true },
      })
    : [];
  const outputById = new Map(outputs.map((o) => [o.id, o]));

  return runs.map((run) => ({
    id: run.id,
    toolId: run.toolId,
    variantId: run.variantId,
    folderId: run.folderId,
    status: run.status,
    stepIndex: run.stepIndex,
    stepTotal: run.stepTotal,
    stepLabel: run.stepLabel,
    outputNodeId: run.outputNodeId,
    outputTitle: outputById.get(run.outputNodeId ?? "")?.title ?? null,
    outputContentType:
      outputById.get(run.outputNodeId ?? "")?.contentType ?? null,
    error: run.error,
    model: run.model,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  }));
}

// ── Run lifecycle ─────────────────────────────────────────────────────────

async function setStep(
  runId: string,
  stepIndex: number,
  stepTotal: number,
  stepLabel: string
): Promise<void> {
  await prisma.studioGenerationRun.update({
    where: { id: runId },
    data: { stepIndex, stepTotal, stepLabel },
  });
}

async function notifyRunFinished(run: {
  id: string;
  ownerId: string;
  toolId: string;
  status: "done" | "failed";
  folderName: string;
  outputNodeId?: string;
  outputTitle?: string;
  error?: string;
}): Promise<void> {
  try {
    const tool = getStudioToolById(run.toolId);
    await publishEvent(prisma, {
      kind: "studio.run",
      actorType: "extension",
      actorLabel: "Folder Studio",
      payload: {
        runId: run.id,
        status: run.status,
        toolLabel: tool?.label ?? run.toolId,
        folderName: run.folderName,
        outputNodeId: run.outputNodeId,
        outputTitle: run.outputTitle,
        error: run.error?.slice(0, 500),
      },
      subjectType: "studioRun",
      subjectId: run.id,
      recipients: [{ userId: run.ownerId }],
    });
  } catch (error) {
    logger.warn({
      layer: "ai",
      event: "studio:run:notify_failed",
      summary: "run notification failed — run state is still correct",
      error,
    });
  }
}

/** Find-or-create the "Studio outputs" subfolder of a source folder. */
async function ensureOutputsFolder(
  userId: string,
  folderId: string
): Promise<string> {
  const existing = await prisma.contentNode.findFirst({
    where: {
      ownerId: userId,
      parentId: folderId,
      contentType: "folder",
      title: STUDIO_OUTPUTS_FOLDER_TITLE,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const slug = await generateUniqueSlug(
    `${STUDIO_OUTPUTS_FOLDER_TITLE} ${folderId.slice(0, 8)}`,
    userId
  );
  const created = await prisma.contentNode.create({
    data: {
      ownerId: userId,
      title: STUDIO_OUTPUTS_FOLDER_TITLE,
      slug,
      contentType: "folder",
      parentId: folderId,
    },
    select: { id: true },
  });
  return created.id;
}

export async function startRun(
  userId: string,
  input: { toolId: string; variantId?: string; folderId: string }
): Promise<{ runId: string } | null> {
  const folder = await prisma.contentNode.findFirst({
    where: {
      id: input.folderId,
      ownerId: userId,
      contentType: "folder",
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!folder) return null;
  const tool = getStudioToolById(input.toolId);
  if (!tool || tool.execution !== "job" || tool.stub) return null;

  const run = await prisma.studioGenerationRun.create({
    data: {
      ownerId: userId,
      folderId: input.folderId,
      toolId: input.toolId,
      variantId: input.variantId ?? null,
      status: "running",
      stepTotal: 3,
      stepLabel: "Queued",
    },
    select: { id: true },
  });
  return { runId: run.id };
}

/**
 * Execute a run to completion. Called AFTER the HTTP response via `after()`
 * — never throws; terminal state + inbox notification always land.
 */
export async function executeRun(runId: string): Promise<void> {
  const run = await prisma.studioGenerationRun.findUnique({
    where: { id: runId },
    include: { folder: { select: { title: true } } },
  });
  if (!run || run.status !== "running") return;

  try {
    const executor = EXECUTORS[run.toolId];
    if (!executor) {
      throw new Error(
        `The ${run.toolId} generator isn't wired yet — it arrives in a later phase.`
      );
    }
    const output = await executor({
      runId: run.id,
      userId: run.ownerId,
      folderId: run.folderId,
      folderTitle: run.folder.title,
      variantId: run.variantId ?? undefined,
    });

    await prisma.studioGenerationRun.update({
      where: { id: runId },
      data: {
        status: "done",
        stepIndex: 3,
        stepLabel: "Done",
        outputNodeId: output.nodeId,
        outputBodyHash: output.bodyHash,
        promptSnapshot: output.promptSnapshot,
        model: output.model,
        sourceNodeIds: output.sourceNodeIds as unknown as Prisma.InputJsonValue,
      },
    });
    await notifyRunFinished({
      id: runId,
      ownerId: run.ownerId,
      toolId: run.toolId,
      status: "done",
      folderName: run.folder.title,
      outputNodeId: output.nodeId,
      outputTitle: output.title,
    });
  } catch (error) {
    const message =
      error instanceof StudioModelUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Generation failed";
    await prisma.studioGenerationRun
      .update({
        where: { id: runId },
        data: { status: "failed", stepLabel: "Failed", error: message },
      })
      .catch(() => undefined);
    await notifyRunFinished({
      id: runId,
      ownerId: run.ownerId,
      toolId: run.toolId,
      status: "failed",
      folderName: run.folder.title,
      error: message,
    });
    logger.error({
      layer: "ai",
      event: "studio:run:failed",
      summary: `studio run failed (${run.toolId})`,
      error,
      attrs: { runId, toolId: run.toolId },
    });
  }
}

// ── Executors ─────────────────────────────────────────────────────────────

interface ExecutorContext {
  runId: string;
  userId: string;
  folderId: string;
  folderTitle: string;
  variantId?: string;
}

interface ExecutorOutput {
  nodeId: string;
  title: string;
  bodyHash: string | null;
  promptSnapshot: string;
  model: string;
  sourceNodeIds: string[];
}

type Executor = (ctx: ExecutorContext) => Promise<ExecutorOutput>;

/** Resolve the studio-generation model or throw the routing-guidance error. */
async function resolveGenerationModel(userId: string) {
  const route = await resolvePrimaryRoute(userId, "studio-generation");
  if (!route) throw new StudioModelUnavailableError();
  const model = await resolveChatModelFromConnection(
    route.connection,
    route.modelId
  );
  return { model, modelId: route.modelId };
}

/** Assemble grounding text from the folder's current source selection. */
async function assembleSources(
  userId: string,
  folderId: string
): Promise<{ text: string; sourceNodeIds: string[] }> {
  const state = await getSelectionState(userId, folderId);
  if (!state || state.includedNodeIds.length === 0) {
    return { text: "", sourceNodeIds: [] };
  }
  const included = new Set(state.includedNodeIds);
  const rows = state.rows.filter((r) => included.has(r.id));
  const resolver = createSourceContentResolver();
  const parts: string[] = [];
  for (const row of rows) {
    const resolved = await resolver.resolve({
      id: row.id,
      contentType: row.contentType,
      title: row.title,
    });
    if (resolved.text.trim()) {
      parts.push(`### ${row.title}\n${resolved.text}`);
    }
  }
  return { text: parts.join("\n\n"), sourceNodeIds: [...included] };
}

const InfographicSchema = z.object({
  title: z.string().min(1).max(120).describe("Short display title."),
  html: z
    .string()
    .min(1)
    .describe(
      "A COMPLETE self-contained HTML document (<!doctype html> through </html>) with all CSS inline in a <style> tag. No external requests, no JavaScript. Design a single-page visual summary: strong typographic hierarchy, 2-4 sections, and simple CSS/SVG charts or diagrams where the data supports them. Must be legible on both light and dark OS themes (set explicit background + text colors)."
    ),
});

/**
 * Infographic (HTML/SVG mode) — the Phase 5 proving executor for the job
 * path: pure LLM text generation, real artifact, no binary pipeline. The
 * diffusion-image mode stays a format option for Phase 6.
 */
const runInfographic: Executor = async (ctx) => {
  if (ctx.variantId === "image") {
    throw new Error(
      "The generated-image mode isn't wired yet — use HTML / SVG for now."
    );
  }
  await setStep(ctx.runId, 1, 3, "Reading sources");
  const sources = await assembleSources(ctx.userId, ctx.folderId);
  if (!sources.text) {
    throw new Error(
      "No readable sources selected — pick at least one source with text."
    );
  }

  await setStep(ctx.runId, 2, 3, "Designing infographic");
  const { model, modelId } = await resolveGenerationModel(ctx.userId);
  const prompt = [
    `Design a one-page infographic summarizing the folder "${ctx.folderTitle}".`,
    "Work strictly from these sources:",
    sources.text,
  ].join("\n\n");

  const { object } = await generateObject({
    model,
    schema: InfographicSchema,
    prompt,
  });

  await setStep(ctx.runId, 3, 3, "Saving artifact");
  const outputsFolderId = await ensureOutputsFolder(ctx.userId, ctx.folderId);
  const title = object.title || `${ctx.folderTitle} — Infographic`;
  const slug = await generateUniqueSlug(title, ctx.userId);
  const bodyHash = stableHash({ html: object.html });
  const node = await prisma.contentNode.create({
    data: {
      ownerId: ctx.userId,
      title,
      slug,
      contentType: "html",
      parentId: outputsFolderId,
      bodyHash,
      htmlPayload: {
        create: {
          html: object.html,
          searchText: object.html
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 10_000),
        },
      },
    },
    select: { id: true },
  });

  return {
    nodeId: node.id,
    title,
    bodyHash,
    promptSnapshot: prompt.slice(0, 20_000),
    model: modelId,
    sourceNodeIds: sources.sourceNodeIds,
  };
};

// ── Phase 6: audio overview ───────────────────────────────────────────────

const AUDIO_STYLES: Record<string, string> = {
  "deep-dive":
    "a thorough narrated walk-through: motivate why the material matters, then move through the key ideas in a logical arc with concrete examples from the sources",
  brief:
    "a tight 2-minute brief: only the essential points, stated plainly, for someone about to walk into a meeting on this",
  critique:
    "a critical review: what the material argues, where it's strong, where it's thin or contradictory, and what's missing",
  debate:
    "a single narrator steelmanning both sides: present the strongest case FOR the material's position, then the strongest case AGAINST, then where the balance lands",
};

// One TTS call — provider hard limits sit near 4096 chars, so scripts are
// budgeted below that. The user's audioOverviewLength setting picks the
// budget ("standard" rides the provider ceiling; "brief" is a ~1-minute
// listen). Multi-voice + chunked long-form is the postponed two-host work
// (plan → Non-goals).
const AUDIO_SCRIPT_CHAR_BUDGETS = { brief: 1_800, standard: 3_900 } as const;

function audioScriptSchema(charBudget: number) {
  return z.object({
    title: z.string().min(1).max(100).describe("Short episode-style title."),
    script: z
      .string()
      .min(1)
      .describe(
        `The narration script: plain spoken prose for a single voice — no headings, no markdown, no stage directions. HARD BUDGET: ${charBudget} characters; end on a complete sentence.`
      ),
  });
}

const runAudioOverview: Executor = async (ctx) => {
  await setStep(ctx.runId, 1, 3, "Reading sources");
  const sources = await assembleSources(ctx.userId, ctx.folderId);
  if (!sources.text) {
    throw new Error(
      "No readable sources selected — pick at least one source with text."
    );
  }

  await setStep(ctx.runId, 2, 3, "Writing script");
  const { model, modelId } = await resolveGenerationModel(ctx.userId);
  const studio = getStudioSettings(await getUserSettings(ctx.userId));
  const charBudget = AUDIO_SCRIPT_CHAR_BUDGETS[studio.audioOverviewLength];
  const style = AUDIO_STYLES[ctx.variantId ?? "deep-dive"] ?? AUDIO_STYLES["deep-dive"];
  const prompt = [
    `Write ${style}, about the folder "${ctx.folderTitle}".`,
    "Work strictly from these sources:",
    sources.text,
  ].join("\n\n");
  const { object } = await generateObject({
    model,
    schema: audioScriptSchema(charBudget),
    prompt,
  });
  const script = object.script.slice(0, charBudget);

  await setStep(ctx.runId, 3, 3, "Generating audio");
  const { generateAndStoreSpeech } = await import(
    "@/lib/domain/ai/speech/generate-and-store"
  );
  const speech = await generateAndStoreSpeech({
    text: script,
    userId: ctx.userId,
    label: object.title || `${ctx.folderTitle} audio overview`,
  });

  // Relocate from the default placement into the Studio outputs folder and
  // stamp the GEN-lock hash.
  const outputsFolderId = await ensureOutputsFolder(ctx.userId, ctx.folderId);
  const bodyHash = stableHash({ script });
  await prisma.contentNode.update({
    where: { id: speech.contentId },
    data: {
      parentId: outputsFolderId,
      role: "primary",
      ownedByNoteId: null,
      bodyHash,
    },
  });

  return {
    nodeId: speech.contentId,
    title: speech.fileName,
    bodyHash,
    promptSnapshot: prompt.slice(0, 20_000),
    model: `${modelId} + ${speech.providerId}:${speech.modelId}`,
    sourceNodeIds: sources.sourceNodeIds,
  };
};

// ── Phase 6: slide deck (.pptx → OnlyOffice) ──────────────────────────────

const SlideDeckSchema = z.object({
  title: z.string().min(1).max(100).describe("Deck title."),
  slides: z
    .array(
      z.object({
        title: z.string().min(1).max(90),
        bullets: z
          .array(z.string().min(1).max(180))
          .min(1)
          .max(6)
          .describe("Concise talking points — fragments, not paragraphs."),
        notes: z
          .string()
          .max(600)
          .optional()
          .describe("Optional speaker notes for this slide."),
      })
    )
    .min(3)
    .max(15),
});

const runSlideDeck: Executor = async (ctx) => {
  await setStep(ctx.runId, 1, 3, "Reading sources");
  const sources = await assembleSources(ctx.userId, ctx.folderId);
  if (!sources.text) {
    throw new Error(
      "No readable sources selected — pick at least one source with text."
    );
  }

  await setStep(ctx.runId, 2, 3, "Outlining deck");
  const { model, modelId } = await resolveGenerationModel(ctx.userId);
  // User default from Studio settings, clamped to the schema's 3-15 window.
  const targetSlides = Math.min(
    15,
    Math.max(3, getStudioSettings(await getUserSettings(ctx.userId)).slideCount)
  );
  const prompt = [
    `Outline a slide deck presenting the folder "${ctx.folderTitle}": a title slide comes free, so start with the first content slide. Structure: context → key points → synthesis/takeaways. Target about ${targetSlides} content slides — fewer if the material is thin, never pad.`,
    "Work strictly from these sources:",
    sources.text,
  ].join("\n\n");
  const { object } = await generateObject({
    model,
    schema: SlideDeckSchema,
    prompt,
  });

  await setStep(ctx.runId, 3, 3, "Building .pptx");
  const { default: PptxGen } = await import("pptxgenjs");
  const pres = new PptxGen();
  pres.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pres.layout = "WIDE";

  const titleSlide = pres.addSlide();
  titleSlide.addText(object.title, {
    x: 0.8,
    y: 2.6,
    w: 11.7,
    h: 1.4,
    fontSize: 40,
    bold: true,
  });
  titleSlide.addText(`Generated from "${ctx.folderTitle}" — Folder Studio`, {
    x: 0.8,
    y: 4.1,
    w: 11.7,
    h: 0.6,
    fontSize: 16,
    color: "666666",
  });

  for (const slide of object.slides) {
    const s = pres.addSlide();
    s.addText(slide.title, {
      x: 0.8,
      y: 0.5,
      w: 11.7,
      h: 1.0,
      fontSize: 28,
      bold: true,
    });
    s.addText(
      slide.bullets.map((b) => ({
        text: b,
        options: { bullet: true, breakLine: true },
      })),
      { x: 0.9, y: 1.8, w: 11.5, h: 5.0, fontSize: 18, valign: "top" }
    );
    if (slide.notes) s.addNotes(slide.notes);
  }

  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;

  // Store like any uploaded file (mirrors the speech pipeline).
  const { getUserStorageProvider } = await import("@/lib/infrastructure/storage");
  const storageProvider = await getUserStorageProvider(ctx.userId);
  const { createHash, randomBytes } = await import("crypto");
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const mimeType =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const storageKey = `uploads/${ctx.userId}/studio-deck-${Date.now()}-${randomBytes(8).toString("hex")}.pptx`;
  await storageProvider.uploadFile(storageKey, buffer, mimeType);

  const outputsFolderId = await ensureOutputsFolder(ctx.userId, ctx.folderId);
  const safeBase = object.title.replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "Slide deck";
  const fileName = `${safeBase}.pptx`;
  const slug = await generateUniqueSlug(fileName, ctx.userId);
  const bodyHash = stableHash({ deck: object });
  const node = await prisma.contentNode.create({
    data: {
      ownerId: ctx.userId,
      title: fileName,
      slug,
      contentType: "file",
      parentId: outputsFolderId,
      bodyHash,
      filePayload: {
        create: {
          fileName,
          fileExtension: "pptx",
          mimeType,
          fileSize: BigInt(buffer.length),
          checksum,
          storageProvider: "r2",
          storageKey,
          searchText: [
            object.title,
            ...object.slides.flatMap((s) => [s.title, ...s.bullets]),
          ]
            .join(" ")
            .slice(0, 10_000),
          uploadStatus: "ready",
          uploadedAt: new Date(),
          isProcessed: true,
          processingStatus: "complete",
        },
      },
    },
    select: { id: true },
  });

  return {
    nodeId: node.id,
    title: fileName,
    bodyHash,
    promptSnapshot: prompt.slice(0, 20_000),
    model: modelId,
    sourceNodeIds: sources.sourceNodeIds,
  };
};

const EXECUTORS: Record<string, Executor> = {
  infographic: runInfographic,
  "audio-overview": runAudioOverview,
  "slide-deck": runSlideDeck,
};

/** Register (or replace) a job executor — later phases add through this. */
export function registerStudioExecutor(toolId: string, executor: Executor) {
  EXECUTORS[toolId] = executor;
}
