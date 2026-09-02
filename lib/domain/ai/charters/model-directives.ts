/**
 * Playbook model-directive accessor (AI 3.4).
 *
 * Thin canonical wrapper mirroring `output-directives.ts`: given a parsed
 * playbook and the active phase index, return the model directive that governs
 * this turn — the phase's own `model:` line, else the standing-rules `model:`
 * line, else null. The parse itself lives in `../model-directive`
 * (`parseModelDirective`); this only picks WHICH raw directive applies and tags
 * its source for the precedence ladder.
 */

import type { ParsedCharter } from "./parse";
import { parseModelDirective, type ModelDirective } from "../model-directive";

export interface PhaseModelResolution {
  directive: ModelDirective;
  /** `playbook-phase` when the phase declared it; `playbook` for standing rules. */
  source: "playbook-phase" | "playbook";
}

export function getPhaseModelDirective(
  playbook: ParsedCharter,
  phaseIndex: number,
): PhaseModelResolution | null {
  const phaseRaw = playbook.phases[phaseIndex]?.modelDirective;
  if (phaseRaw) {
    const directive = parseModelDirective(phaseRaw);
    if (directive) return { directive, source: "playbook-phase" };
  }
  const standingRaw = playbook.standingRules.modelDirective;
  if (standingRaw) {
    const directive = parseModelDirective(standingRaw);
    if (directive) return { directive, source: "playbook" };
  }
  return null;
}
