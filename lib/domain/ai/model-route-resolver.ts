/**
 * Playbook model-route resolver (AI 3.4, server-only).
 *
 * Turns a parsed `ModelDirective` into a concrete connection + model by
 * resolving through the machinery that already exists:
 *   - role     → resolveFeatureRoute(role-<name>) — user's ordered backups,
 *                capability filter, and registry default (all for free)
 *   - class    → deterministic family match over the user's connected models
 *   - explicit → preset-match then namespaced-model match (mirrors the chat
 *                route's own connection lookup)
 *
 * Returns null when nothing resolves — the caller then emits a visible
 * fall-through notice and drops to the normal ladder (NEVER a silent swap).
 */

import "server-only";
import {
  getConnectionWithKey,
  type ConnectionView,
  type ConnectionWithKey,
} from "@/lib/features/ai-connections";
import { resolveFeatureRoute } from "./features/router";
import {
  resolveModelClass,
  roleFeatureId,
  type ModelDirective,
  type RoutableModel,
} from "./model-directive";

export interface AppliedModelRoute {
  connection: ConnectionWithKey;
  modelId: string;
}

export async function resolvePlaybookModelRoute(
  userId: string,
  directive: ModelDirective,
  userConns: ConnectionView[],
): Promise<AppliedModelRoute | null> {
  if (directive.kind === "role") {
    // The feature router already handles ordered backups, capability
    // filtering, the registry default, and a last-resort auto-bind.
    const routes = await resolveFeatureRoute(userId, roleFeatureId(directive.role));
    const top = routes[0];
    return top ? { connection: top.connection, modelId: top.modelId } : null;
  }

  if (directive.kind === "class") {
    const routable: RoutableModel[] = userConns.flatMap((c) =>
      c.models.map((m) => ({ connectionId: c.id, modelId: m.id })),
    );
    // Ranked most-specific-first — walk the chain so a vanished connection
    // falls to the next family member rather than dropping the directive.
    for (const match of resolveModelClass(directive.family, routable)) {
      try {
        const connection = await getConnectionWithKey(userId, match.connectionId);
        return { connection, modelId: match.modelId };
      } catch {
        /* connection vanished — try the next ranked match */
      }
    }
    return null;
  }

  // Explicit provider/model — mirror the route's preset-match → namespaced
  // lookup so a playbook `model: anthropic/claude-opus-4` resolves exactly
  // like the picker would.
  const { providerId, modelId } = directive;
  const presetMatch = userConns.find(
    (c) => c.presetId === providerId && c.models.some((m) => m.id === modelId),
  );
  if (presetMatch) {
    try {
      return {
        connection: await getConnectionWithKey(userId, presetMatch.id),
        modelId,
      };
    } catch {
      /* fall through to namespaced */
    }
  }
  const namespaced = `${providerId}/${modelId}`;
  const nsMatch = userConns.find((c) =>
    c.models.some((m) => m.id === namespaced),
  );
  if (nsMatch) {
    try {
      return {
        connection: await getConnectionWithKey(userId, nsMatch.id),
        modelId: namespaced,
      };
    } catch {
      /* fall through to null */
    }
  }
  return null;
}

/** Visible notice when a directive can't resolve — never a silent swap. */
export function describeUnresolvedDirective(directive: ModelDirective): string {
  switch (directive.kind) {
    case "role":
      return `No model is mapped for the "${directive.role}" role — continuing on the current model. Map one in Settings → AI → Feature Routing.`;
    case "class":
      return `No connected model matches "${directive.family}" — continuing on the current model.`;
    case "explicit":
      return `${directive.providerId}/${directive.modelId} isn't connected — continuing on the current model.`;
  }
}
