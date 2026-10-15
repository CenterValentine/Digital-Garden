/**
 * Client for the DOCX template renderer (server/docx-renderer).
 *
 * The renderer is a stateless Cloud Run service with no credentials: this
 * module is where the app hands it a template's bytes and the validated
 * values, and gets back a filled document plus the diagnostics it judged
 * the output by. Everything else — who the user is, whether they own the
 * template, where the result is stored — stays on this side.
 *
 * Auth has two layers, matching cloudbuild.docx-renderer.yaml:
 *  - Cloud Run IAM (`--no-allow-unauthenticated`): the request carries a
 *    Google ID token for the service URL. In production that token is
 *    minted from Vercel's OIDC token via Workload Identity Federation and
 *    service-account impersonation, so no GCP key is stored anywhere.
 *  - `X-Renderer-Token`: a shared secret the service checks when it has
 *    one configured — the only layer in local dev, a second factor in prod.
 *
 * Env:
 *  DOCX_RENDERER_URL                 base URL (unset → feature unavailable)
 *  DOCX_RENDERER_SHARED_TOKEN        X-Renderer-Token value (optional)
 *  DOCX_RENDERER_ID_TOKEN            static ID token override — local dev
 *                                    against the deployed service
 *                                    (`gcloud auth print-identity-token`)
 *  GCP_WIF_AUDIENCE                  //iam.googleapis.com/projects/<n>/locations/
 *                                    global/workloadIdentityPools/<pool>/providers/<provider>
 *  GCP_RENDERER_INVOKER_SA           service account email with roles/run.invoker
 *                                    on the renderer (the WIF principal must hold
 *                                    roles/iam.serviceAccountTokenCreator on it)
 */

import { logger } from "@/lib/core/logger";
import { hasDocxProperties, type DocxProperties } from "@/lib/domain/export/docx-properties";

// ---------------------------------------------------------------------------
// Contract types — mirror server/docx-renderer/contract.py exactly.

export interface TemplateField {
  /** Dotted path relative to its section: `header.name`, or `title` inside `experience`. */
  path: string;
  /** false when the template guards the field with `{% if %}`. */
  required: boolean;
  /** A `{{r }}` tag — accepts `{ text, url }` and renders a hyperlink. */
  rich: boolean;
}

export interface TemplateSection {
  /** Dotted path of the iterable relative to the parent: `experience`, `bullets`. */
  path: string;
  /** The loop variable the template bound (`job`); informational. */
  item: string | null;
  /** The list holds scalars (`{{ skill }}`), not objects. */
  itemIsValue: boolean;
  fields: TemplateField[];
  sections: TemplateSection[];
}

export interface TemplateError {
  code: "not_a_docx" | "template_syntax" | string;
  message: string;
  part?: "body" | "header" | "footer";
  paragraph?: number;
  near?: string;
}

export interface TemplateContract {
  ok: boolean;
  /** sha256 of the template bytes the contract was derived from. */
  checksum: string;
  fields: TemplateField[];
  sections: TemplateSection[];
  errors: TemplateError[];
  warnings: string[];
}

export interface RenderDiagnostics {
  durationMs: number;
  bytes: number;
  /** Snippets still shaped like a tag after rendering. */
  unresolved: string[];
  /** Top-level names the template reads that `values` did not supply. */
  missing: string[];
  /** Keys in `values` the template never reads. */
  unused: string[];
  textChars: number;
  /** Word properties the produced file actually carries (read back). */
  properties?: Record<string, string>;
}

/**
 * Flat, not a discriminated union: tsconfig is not strict, so `!r.ok`
 * would not narrow (CLAUDE.md, Code Standards). `ok: true` guarantees
 * `docx`, `text`, `checksum` and `diagnostics`; `ok: false` guarantees
 * `error`.
 */
export interface RenderOutcome {
  ok: boolean;
  docx?: Buffer;
  /** Text read back out of the produced file — body, tables, headers, footers. */
  text?: string;
  checksum?: string;
  diagnostics?: RenderDiagnostics;
  error?: { code: string; message: string; details?: unknown };
}

/** A value tree for the renderer: strings, numbers, booleans, null, nested
 * objects and lists; `{ text, url }` for a rich field. */
export type TemplateValue =
  | string
  | number
  | boolean
  | null
  | { text?: string; url: string }
  | TemplateValue[]
  | { [key: string]: TemplateValue };

// ---------------------------------------------------------------------------
// Configuration

export class DocxRendererUnavailableError extends Error {
  constructor(message = "The document renderer is not configured (DOCX_RENDERER_URL).") {
    super(message);
    this.name = "DocxRendererUnavailableError";
  }
}

export function isDocxRendererConfigured(): boolean {
  return Boolean(process.env.DOCX_RENDERER_URL?.trim());
}

function rendererUrl(): string {
  const url = process.env.DOCX_RENDERER_URL?.trim();
  if (!url) throw new DocxRendererUnavailableError();
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Invoker identity (Cloud Run IAM)

let cachedIdToken: { token: string; expiresAt: number } | null = null;

function jwtExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof payload.exp === "number" ? payload.exp * 1000 : Date.now() + 5 * 60_000;
  } catch {
    return Date.now() + 5 * 60_000;
  }
}

/**
 * Vercel OIDC → Google STS (federated token) → impersonate the invoker
 * service account → ID token whose audience is the renderer URL. The
 * federated token itself is never used to call the renderer: Cloud Run
 * accepts ID tokens for a principal with run.invoker, which is the SA.
 */
async function mintIdTokenViaWorkloadIdentity(audience: string): Promise<string> {
  const wifAudience = process.env.GCP_WIF_AUDIENCE?.trim();
  const invokerSa = process.env.GCP_RENDERER_INVOKER_SA?.trim();
  if (!wifAudience || !invokerSa) {
    throw new DocxRendererUnavailableError(
      "The renderer requires authentication but GCP_WIF_AUDIENCE / GCP_RENDERER_INVOKER_SA are not set.",
    );
  }
  const [{ getVercelOidcToken }, { IdentityPoolClient, Impersonated }] = await Promise.all([
    import("@vercel/functions/oidc"),
    import("google-auth-library"),
  ]);
  const federated = new IdentityPoolClient({
    type: "external_account",
    audience: wifAudience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  const impersonated = new Impersonated({
    sourceClient: federated,
    targetPrincipal: invokerSa,
    targetScopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  return impersonated.fetchIdToken(audience);
}

async function invokerIdToken(baseUrl: string): Promise<string | null> {
  const override = process.env.DOCX_RENDERER_ID_TOKEN?.trim();
  if (override) return override;
  // A localhost renderer has no IAM in front of it.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl)) return null;
  if (cachedIdToken && cachedIdToken.expiresAt - 60_000 > Date.now()) return cachedIdToken.token;
  const token = await mintIdTokenViaWorkloadIdentity(baseUrl);
  cachedIdToken = { token, expiresAt: jwtExpiryMs(token) };
  return token;
}

async function headersFor(baseUrl: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const idToken = await invokerIdToken(baseUrl);
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const shared = process.env.DOCX_RENDERER_SHARED_TOKEN?.trim();
  if (shared) headers["X-Renderer-Token"] = shared;
  return headers;
}

// ---------------------------------------------------------------------------
// Calls

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const REQUEST_TIMEOUT_MS = 45_000;

function templatePart(form: FormData, template: Buffer, fileName: string): void {
  form.set("template", new Blob([new Uint8Array(template)], { type: DOCX_MIME }), fileName);
}

async function post(path: string, form: FormData): Promise<{ status: number; body: unknown }> {
  const base = rendererUrl();
  const started = Date.now();
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: await headersFor(base),
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { error: { code: "renderer_bad_response", message: text.slice(0, 200) } };
  }
  logger.info({
    layer: "ai",
    event: "docx_renderer:call",
    summary: `${path} → ${response.status}`,
    attrs: { path, status: response.status, durationMs: Date.now() - started },
  });
  return { status: response.status, body };
}

/** Preflight a template: the contract the model will write values against. */
export async function inspectDocxTemplate(
  template: Buffer,
  fileName = "template.docx",
): Promise<TemplateContract> {
  const form = new FormData();
  templatePart(form, template, fileName);
  const { status, body } = await post("/inspect", form);
  const contract = body as Partial<TemplateContract> | null;
  if (!contract || typeof contract.checksum !== "string") {
    throw new Error(`Renderer /inspect returned an unexpected response (HTTP ${status}).`);
  }
  return {
    ok: contract.ok === true,
    checksum: contract.checksum,
    fields: contract.fields ?? [],
    sections: contract.sections ?? [],
    errors: contract.errors ?? [],
    warnings: contract.warnings ?? [],
  };
}

/** Fill a template. Pass the checksum from the contract the values were
 * written against — the renderer refuses a template that changed since. */
export async function renderDocxTemplate(
  template: Buffer,
  values: Record<string, TemplateValue>,
  options: { expectedChecksum?: string; fileName?: string; properties?: DocxProperties } = {},
): Promise<RenderOutcome> {
  const form = new FormData();
  templatePart(form, template, options.fileName ?? "template.docx");
  form.set("values", JSON.stringify(values));
  if (options.expectedChecksum) form.set("expectedChecksum", options.expectedChecksum);
  if (options.properties && hasDocxProperties(options.properties)) {
    form.set("properties", JSON.stringify(options.properties));
  }
  const { status, body } = await post("/render", form);
  const result = (body ?? {}) as {
    ok?: boolean;
    docxBase64?: string;
    text?: string;
    checksum?: string;
    diagnostics?: RenderDiagnostics;
    error?: { code: string; message: string; details?: unknown };
    detail?: { code?: string; message?: string };
  };
  if (result.ok && typeof result.docxBase64 === "string" && result.diagnostics) {
    return {
      ok: true,
      docx: Buffer.from(result.docxBase64, "base64"),
      text: result.text ?? "",
      checksum: result.checksum ?? "",
      diagnostics: result.diagnostics,
    };
  }
  // FastAPI's own validation/auth errors arrive as `detail`; the renderer's
  // judged refusals as `error`. Flatten both so callers switch on one code.
  const error = result.error ??
    (result.detail
      ? { code: result.detail.code ?? "renderer_rejected", message: result.detail.message ?? `HTTP ${status}` }
      : { code: "renderer_failed", message: `Renderer returned HTTP ${status}.` });
  return {
    ok: false,
    error,
    ...(result.checksum ? { checksum: result.checksum } : {}),
    ...(result.diagnostics ? { diagnostics: result.diagnostics as RenderDiagnostics } : {}),
  };
}
