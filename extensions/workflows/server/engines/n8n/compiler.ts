/**
 * Compile a Trellis WorkflowGraph → n8n workflow JSON (the push target).
 *
 * Model (proxy-not-share): n8n orchestrates; the APP executes. Every DG step
 * node becomes an n8n HTTP Request node that calls the execute-node callback
 * (app runs the executor, returns outputs). Control nodes map to n8n natives:
 * gate → openGate callback + Wait(webhook); delay → Wait(timeInterval);
 * branch → IF. The trigger is a Webhook the adapter POSTs { runId, input } to.
 *
 * Node type/typeVersion/parameter shapes below were validated against a live
 * n8n 2.10.2 (create → read-back → delete probe), not guessed.
 *
 * Reference translation: the app's {{input.path}} / {{nodeId.path}} templates
 * become n8n expressions. Each node's output lives at a different place in
 * n8n, so a first pass maps nodeId → its n8n output-reference prefix.
 */

import { randomUUID } from "crypto";

import type { WorkflowGraph, WorkflowGraphNode } from "../../../graph/schema";
import { isTriggerType } from "../../../nodes/triggers";
import type { N8nConnections, N8nNode, N8nWorkflow } from "./types";

const N8N_TYPES = {
  webhook: { type: "n8n-nodes-base.webhook", typeVersion: 2 },
  httpRequest: { type: "n8n-nodes-base.httpRequest", typeVersion: 4.2 },
  if: { type: "n8n-nodes-base.if", typeVersion: 2.2 },
  wait: { type: "n8n-nodes-base.wait", typeVersion: 1.1 },
} as const;

export interface N8nCompileOptions {
  workflowName: string;
  /** App public base URL for callbacks, no trailing slash (n8n → app). */
  callbackBaseUrl: string;
  /** Webhook path the adapter POSTs { runId, input } to, to start a run. */
  webhookPath: string;
  /** n8n httpHeaderAuth credential holding the DG service token (Bearer). */
  credential: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Reference translation ({{input.x}} / {{nodeId.path}} → n8n expressions)
// ---------------------------------------------------------------------------

/** Where a node's output data lives in n8n, as an expression prefix. */
type OutputRef = { expr: (rest: string) => string };

function buildRefMap(
  graph: WorkflowGraph,
  triggerId: string
): Map<string, OutputRef> {
  const map = new Map<string, OutputRef>();
  // input.* comes from the trigger webhook body: { runId, input }. n8n's Webhook
  // node nests the POST body under `.body`, so it lives at `$json.body.input`.
  map.set("input", {
    expr: (rest) => `$('${triggerId}').item.json.body.input${rest}`,
  });
  for (const node of graph.nodes) {
    if (node.id === triggerId) continue;
    if (node.type === "gate") {
      // The gate's resolution is the Wait node's resume payload passthrough.
      map.set(node.id, { expr: (rest) => `$('${node.id}').item.json${rest}` });
    } else if (node.type === "delay" || node.type === "branch") {
      // Rarely referenced downstream; the Wait/IF node passes input through.
      map.set(node.id, { expr: (rest) => `$('${node.id}').item.json${rest}` });
    } else {
      // DG step node: outputs live under the HTTP Request response envelope.
      map.set(node.id, {
        expr: (rest) => `$('${node.id}').item.json.data.outputs${rest}`,
      });
    }
  }
  return map;
}

const TEMPLATE_PATTERN = /\{\{\s*([a-zA-Z0-9_$.-]+)\s*\}\}/g;

/** Turn a single {{head.rest}} reference into an n8n expression body. */
function refToN8nExpr(path: string, refs: Map<string, OutputRef>): string {
  const segments = path.split(".").filter(Boolean);
  const [head, ...rest] = segments;
  const ref = refs.get(head);
  const restPath = rest.length ? `.${rest.join(".")}` : "";
  if (!ref) return `''`; // unknown head → empty string, matches interpreter
  return ref.expr(restPath);
}

/** Build the n8n expression that yields the execute-node request body object. */
function buildConfigObjectExpr(
  config: Record<string, unknown>,
  refs: Map<string, OutputRef>
): string {
  const entries: string[] = [];
  for (const [key, raw] of Object.entries(config)) {
    if (typeof raw === "string" && TEMPLATE_PATTERN.test(raw)) {
      TEMPLATE_PATTERN.lastIndex = 0;
      // Interpolated string → build via template literal so text + refs mix.
      const parts = raw.replace(
        TEMPLATE_PATTERN,
        (_m, path: string) => "${" + refToN8nExpr(path, refs) + "}"
      );
      entries.push(`${JSON.stringify(key)}: \`${parts}\``);
    } else {
      entries.push(`${JSON.stringify(key)}: ${JSON.stringify(raw)}`);
    }
    TEMPLATE_PATTERN.lastIndex = 0;
  }
  return `{ ${entries.join(", ")} }`;
}

// ---------------------------------------------------------------------------
// Node builders
// ---------------------------------------------------------------------------

let positionCounter = 0;
function nextPosition(): [number, number] {
  const x = positionCounter * 240;
  positionCounter += 1;
  return [x, 0];
}

function callbackUrl(
  opts: N8nCompileOptions,
  triggerId: string,
  action: string
): string {
  // Webhook body is nested under `.body` (see buildRefMap); read runId there.
  return `=${opts.callbackBaseUrl}/api/workflows/callback/runs/{{ $('${triggerId}').item.json.body.runId }}/${action}`;
}

function httpAuthParams() {
  return {
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
  };
}

function credentials(opts: N8nCompileOptions) {
  return { httpHeaderAuth: { id: opts.credential.id, name: opts.credential.name } };
}

function buildWebhookNode(triggerId: string, opts: N8nCompileOptions): N8nNode {
  return {
    id: randomUUID(),
    name: triggerId,
    ...N8N_TYPES.webhook,
    position: nextPosition(),
    parameters: {
      httpMethod: "POST",
      path: opts.webhookPath,
      responseMode: "onReceived",
    },
    webhookId: opts.webhookPath,
  };
}

function buildDgNode(
  node: WorkflowGraphNode,
  triggerId: string,
  refs: Map<string, OutputRef>,
  opts: N8nCompileOptions
): N8nNode {
  const bodyExpr = `={{ ({ "nodeId": ${JSON.stringify(node.id)}, "nodeType": ${JSON.stringify(node.type)}, "config": ${buildConfigObjectExpr(node.config, refs)} }) }}`;
  return {
    id: randomUUID(),
    name: node.id,
    ...N8N_TYPES.httpRequest,
    position: nextPosition(),
    parameters: {
      method: "POST",
      url: callbackUrl(opts, triggerId, "execute-node"),
      sendHeaders: false,
      sendBody: true,
      specifyBody: "json",
      jsonBody: bodyExpr,
      ...httpAuthParams(),
    },
    credentials: credentials(opts),
  };
}

/** Gate → an openGate HTTP Request (named <id>__open) + a Wait(webhook) named <id>. */
function buildGateNodes(
  node: WorkflowGraphNode,
  triggerId: string,
  refs: Map<string, OutputRef>,
  opts: N8nCompileOptions
): { open: N8nNode; wait: N8nNode } {
  const title = typeof node.config.title === "string" ? node.config.title : "Awaiting review";
  const body = typeof node.config.body === "string" ? node.config.body : "";
  const token = `gate:${node.id}`;
  const gateBody =
    `={{ ({ "token": ${JSON.stringify(token)}, ` +
    `"title": \`${title.replace(TEMPLATE_PATTERN, (_m, p: string) => "${" + refToN8nExpr(p, refs) + "}")}\`, ` +
    (body
      ? `"body": \`${body.replace(TEMPLATE_PATTERN, (_m, p: string) => "${" + refToN8nExpr(p, refs) + "}")}\`, `
      : "") +
    `"engineGateRef": $execution.resumeUrl }) }}`;
  TEMPLATE_PATTERN.lastIndex = 0;

  const open: N8nNode = {
    id: randomUUID(),
    name: `${node.id}__open`,
    ...N8N_TYPES.httpRequest,
    position: nextPosition(),
    parameters: {
      method: "POST",
      url: callbackUrl(opts, triggerId, "gate"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: gateBody,
      ...httpAuthParams(),
    },
    credentials: credentials(opts),
  };
  const wait: N8nNode = {
    id: randomUUID(),
    name: node.id,
    ...N8N_TYPES.wait,
    position: nextPosition(),
    parameters: { resume: "webhook" },
    webhookId: randomUUID(),
  };
  return { open, wait };
}

function buildDelayNode(node: WorkflowGraphNode): N8nNode {
  const duration = String(node.config.duration ?? "1m");
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/);
  const amount = Number(match?.[1] ?? 1);
  const unit = { s: "seconds", m: "minutes", h: "hours", d: "days" }[
    (match?.[2] ?? "m") as "s" | "m" | "h" | "d"
  ];
  return {
    id: randomUUID(),
    name: node.id,
    ...N8N_TYPES.wait,
    position: nextPosition(),
    parameters: { resume: "timeInterval", amount, unit },
  };
}

const BRANCH_OPERATORS: Record<
  string,
  (leftExpr: string, compare: string) => { left: string; right: unknown; op: Record<string, unknown> }
> = {
  truthy: (l) => ({ left: `={{ !!(${l}) }}`, right: true, op: { type: "boolean", operation: "true", singleValue: true } }),
  equals: (l, c) => ({ left: `={{ ${l} }}`, right: c, op: { type: "string", operation: "equals" } }),
  notEquals: (l, c) => ({ left: `={{ ${l} }}`, right: c, op: { type: "string", operation: "notEquals" } }),
  gt: (l, c) => ({ left: `={{ Number(${l}) }}`, right: Number(c), op: { type: "number", operation: "gt" } }),
  gte: (l, c) => ({ left: `={{ Number(${l}) }}`, right: Number(c), op: { type: "number", operation: "gte" } }),
  lt: (l, c) => ({ left: `={{ Number(${l}) }}`, right: Number(c), op: { type: "number", operation: "lt" } }),
  lte: (l, c) => ({ left: `={{ Number(${l}) }}`, right: Number(c), op: { type: "number", operation: "lte" } }),
  contains: (l, c) => ({ left: `={{ ${l} }}`, right: c, op: { type: "string", operation: "contains" } }),
};

function buildBranchNode(
  node: WorkflowGraphNode,
  refs: Map<string, OutputRef>
): N8nNode {
  const path = typeof node.config.path === "string" ? node.config.path : "";
  const operator = typeof node.config.operator === "string" ? node.config.operator : "truthy";
  const compare = typeof node.config.value === "string" ? node.config.value : "";
  const leftExpr = refToN8nExpr(path, refs);
  const build = BRANCH_OPERATORS[operator] ?? BRANCH_OPERATORS.truthy;
  const { left, right, op } = build(leftExpr, compare);
  return {
    id: randomUUID(),
    name: node.id,
    ...N8N_TYPES.if,
    position: nextPosition(),
    parameters: {
      conditions: {
        options: { caseSensitive: true, typeValidation: "loose", version: 2 },
        combinator: "and",
        conditions: [
          { id: `${node.id}-cond`, leftValue: left, rightValue: right, operator: op },
        ],
      },
    },
  };
}

function buildFinishNode(triggerId: string, opts: N8nCompileOptions): N8nNode {
  return {
    id: randomUUID(),
    name: "__finish",
    ...N8N_TYPES.httpRequest,
    position: nextPosition(),
    parameters: {
      method: "POST",
      url: callbackUrl(opts, triggerId, "finish"),
      sendBody: true,
      specifyBody: "json",
      jsonBody: `={{ ({ "status": "succeeded", "output": { "outcome": "completed" } }) }}`,
      ...httpAuthParams(),
    },
    credentials: credentials(opts),
  };
}

// ---------------------------------------------------------------------------
// Compile
// ---------------------------------------------------------------------------

function connect(
  connections: N8nConnections,
  from: string,
  to: string,
  outputIndex = 0
): void {
  const entry = connections[from] ?? { main: [] };
  while (entry.main.length <= outputIndex) entry.main.push([]);
  entry.main[outputIndex].push({ node: to, type: "main", index: 0 });
  connections[from] = entry;
}

export function compileGraphToN8n(
  graph: WorkflowGraph,
  opts: N8nCompileOptions
): N8nWorkflow {
  positionCounter = 0;
  const triggerNode = graph.nodes.find((n) => isTriggerType(n.type));
  const triggerId = triggerNode?.id ?? graph.entryNodeId;
  const refs = buildRefMap(graph, triggerId);
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const nodes: N8nNode[] = [];
  const connections: N8nConnections = {};
  // The n8n node NAME each graph node routes FROM (gate routes from its Wait).
  const exitName = new Map<string, string>();

  // Trigger → Webhook.
  nodes.push(buildWebhookNode(triggerId, opts));
  exitName.set(triggerId, triggerId);

  for (const node of graph.nodes) {
    if (node.id === triggerId) continue;
    if (node.type === "gate") {
      const { open, wait } = buildGateNodes(node, triggerId, refs, opts);
      nodes.push(open, wait);
      connect(connections, open.name, wait.name);
      // Entry into a gate goes to its __open node; exit is its Wait node.
      exitName.set(node.id, wait.name);
    } else if (node.type === "delay") {
      nodes.push(buildDelayNode(node));
      exitName.set(node.id, node.id);
    } else if (node.type === "branch") {
      nodes.push(buildBranchNode(node, refs));
      exitName.set(node.id, node.id);
    } else {
      nodes.push(buildDgNode(node, triggerId, refs, opts));
      exitName.set(node.id, node.id);
    }
  }

  const finish = buildFinishNode(triggerId, opts);
  nodes.push(finish);

  // The n8n node a graph node ENTERS at (gate enters at its __open node).
  const entryName = (id: string): string =>
    nodeById.get(id)?.type === "gate" ? `${id}__open` : id;

  // Wire edges. Branch nodes route true→output0, false→output1.
  for (const node of graph.nodes) {
    const outgoing = graph.edges.filter((e) => e.from === node.id);
    const from = exitName.get(node.id) ?? node.id;
    if (node.type === "branch") {
      const trueEdge = outgoing.find((e) => e.branch === "true");
      const falseEdge = outgoing.find((e) => e.branch === "false");
      connect(connections, from, trueEdge ? entryName(trueEdge.to) : finish.name, 0);
      connect(connections, from, falseEdge ? entryName(falseEdge.to) : finish.name, 1);
    } else {
      const next = outgoing[0]?.to;
      connect(connections, from, next ? entryName(next) : finish.name);
    }
  }

  return {
    name: opts.workflowName,
    nodes,
    connections,
    settings: {},
  };
}
