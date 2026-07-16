/**
 * n8n engine identity + per-workflow push metadata. Kept separate from push.ts
 * so dispatch can read it without importing the compiler/REST client.
 */

/** Payload-level engine tag (graph-engine namespace), like "wdk-interpreter@1". */
export const N8N_PAYLOAD_ENGINE = "n8n@1";
/** Adapter-registry key (definition.engine), like "wdk". */
export const N8N_ADAPTER_ENGINE = "n8n";

export interface N8nPushMetadata {
  workflowId?: string;
  webhookPath?: string;
  credentialId?: string;
  credentialName?: string;
  /** "native" = authored in n8n's editor; "compiled" = compiled from a Trellis graph. */
  mode?: "native" | "compiled";
}

/** Extract the `.n8n` push metadata from a WorkflowPayload.metadata JSON value. */
export function readN8nMetadata(metadata: unknown): N8nPushMetadata {
  if (metadata && typeof metadata === "object" && "n8n" in metadata) {
    const n8n = (metadata as { n8n?: unknown }).n8n;
    if (n8n && typeof n8n === "object" && !Array.isArray(n8n)) {
      return n8n as N8nPushMetadata;
    }
  }
  return {};
}
