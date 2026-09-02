/**
 * Provider-neutral checkpoint integrity for playbook phases.
 *
 * Some models treat `phase_checkpoint` as a shortcut: they summarize work
 * they intended to do, then request approval before any supporting tool call
 * completed. This small mutable request-scoped gate makes externally
 * verifiable phase requirements enforceable by the runtime.
 */

export interface PhaseCheckpointGate {
  active: boolean;
  phaseTitle?: string;
  requiresResearch: boolean;
  referenceContentIds: string[];
  observedResearch: boolean;
  observedReferenceContentIds: string[];
}

export interface PhaseToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface PhaseToolResult {
  toolCallId: string;
}

export interface PhaseCheckpointGateStatus {
  ready: boolean;
  missingRequirements: string[];
}

const RESEARCH_DIRECTIVE =
  /\b(?:research|web resources?|search (?:the )?web|current sources?|source-backed|evidence-backed)\b/i;

export function createPhaseCheckpointGate(): PhaseCheckpointGate {
  return {
    active: false,
    requiresResearch: false,
    referenceContentIds: [],
    observedResearch: false,
    observedReferenceContentIds: [],
  };
}

export function configurePhaseCheckpointGate(
  gate: PhaseCheckpointGate,
  input: {
    phaseTitle: string;
    phaseText: string;
    referenceContentIds: string[];
    researchToolsAvailable?: boolean;
    referenceToolAvailable?: boolean;
  },
): void {
  const referenceContentIds =
    input.referenceToolAvailable === false
      ? []
      : Array.from(new Set(input.referenceContentIds));
  const requiresResearch =
    input.researchToolsAvailable !== false &&
    RESEARCH_DIRECTIVE.test(input.phaseText);

  gate.active = requiresResearch || referenceContentIds.length > 0;
  gate.phaseTitle = input.phaseTitle;
  gate.requiresResearch = requiresResearch;
  gate.referenceContentIds = referenceContentIds;
  gate.observedResearch = false;
  gate.observedReferenceContentIds = [];
}

export function recordCompletedPhaseTools(
  gate: PhaseCheckpointGate,
  toolCalls: PhaseToolCall[],
  toolResults: PhaseToolResult[],
): void {
  if (!gate.active) return;

  const completedIds = new Set(toolResults.map((result) => result.toolCallId));
  for (const call of toolCalls) {
    if (!completedIds.has(call.toolCallId)) continue;

    if (call.toolName === "search_web" || call.toolName === "read_page") {
      gate.observedResearch = true;
    }

    if (
      call.toolName === "getCurrentNote" &&
      call.input &&
      typeof call.input === "object"
    ) {
      const contentId = (call.input as { contentId?: unknown }).contentId;
      if (
        typeof contentId === "string" &&
        gate.referenceContentIds.includes(contentId) &&
        !gate.observedReferenceContentIds.includes(contentId)
      ) {
        gate.observedReferenceContentIds.push(contentId);
      }
    }
  }
}

/**
 * Rehydrate the gate on an approval-resume request. Tool approval causes a
 * new HTTP request, so the evidence collected in the original stream must be
 * recoverable from the current turn's persisted UI tool parts.
 */
export function recordCompletedPhaseToolsFromMessages(
  gate: PhaseCheckpointGate,
  messages: unknown[],
): void {
  if (!gate.active) return;

  let latestUserIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index] as { role?: unknown };
    if (message?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  const toolCalls: PhaseToolCall[] = [];
  const toolResults: PhaseToolResult[] = [];
  for (const rawMessage of messages.slice(latestUserIndex + 1)) {
    const message = rawMessage as { role?: unknown; parts?: unknown };
    if (message?.role !== "assistant" || !Array.isArray(message.parts)) {
      continue;
    }
    for (const rawPart of message.parts) {
      if (!rawPart || typeof rawPart !== "object") continue;
      const part = rawPart as {
        type?: unknown;
        toolName?: unknown;
        toolCallId?: unknown;
        state?: unknown;
        input?: unknown;
      };
      if (
        typeof part.type !== "string" ||
        typeof part.toolCallId !== "string" ||
        part.state !== "output-available"
      ) {
        continue;
      }
      const toolName =
        part.type === "dynamic-tool" && typeof part.toolName === "string"
          ? part.toolName
          : part.type.startsWith("tool-")
            ? part.type.slice(5)
            : "";
      if (!toolName) continue;
      toolCalls.push({
        toolCallId: part.toolCallId,
        toolName,
        input: part.input,
      });
      toolResults.push({ toolCallId: part.toolCallId });
    }
  }

  recordCompletedPhaseTools(gate, toolCalls, toolResults);
}

export function getPhaseCheckpointGateStatus(
  gate: PhaseCheckpointGate | undefined,
): PhaseCheckpointGateStatus {
  if (!gate?.active) {
    return { ready: true, missingRequirements: [] };
  }

  const missingRequirements: string[] = [];
  if (gate.requiresResearch && !gate.observedResearch) {
    missingRequirements.push(
      "Complete at least one web research call with search_web or read_page.",
    );
  }
  if (
    gate.referenceContentIds.length > 0 &&
    gate.observedReferenceContentIds.length === 0
  ) {
    missingRequirements.push(
      "Read at least one linked extension with getCurrentNote.",
    );
  }

  return {
    ready: missingRequirements.length === 0,
    missingRequirements,
  };
}

export function renderPhaseCheckpointGateInstruction(
  gate: PhaseCheckpointGate,
): string {
  if (!gate.active) return "";

  const requirements: string[] = [];
  if (gate.requiresResearch) {
    requirements.push(
      "complete at least one `search_web` or `read_page` call",
    );
  }
  if (gate.referenceContentIds.length > 0) {
    requirements.push(
      "read at least one linked extension using `getCurrentNote` and an ID from the manifest",
    );
  }

  return (
    `Checkpoint integrity for "${gate.phaseTitle ?? "the current phase"}": ` +
    `before calling \`phase_checkpoint\`, ${requirements.join(" and ")}. ` +
    "The runtime rejects a premature checkpoint. Never describe planned, inferred, or unperformed work as completed."
  );
}
