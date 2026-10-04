/**
 * In-app feedback → GitHub issue templates.
 *
 * One definition per issue kind, mirroring `.github/ISSUE_TEMPLATE/*.md`
 * section for section, so an issue filed from the app reads exactly like one
 * filed on GitHub and `/bug-triage` (which triages `bug`-labeled issues)
 * picks in-app bugs up with no extra wiring. `pnpm feedback:check` fails if a
 * template's bold headings and the matching kind's sections drift apart.
 *
 * Client-safe: no Prisma, no server imports. The dialog uses `composeIssue`
 * for its preview and the GitHub fallback URL; the API route recomposes from
 * the same structured input, so the server never trusts client-built markdown
 * or labels.
 */

export const FEEDBACK_REPO_DEFAULT = "CenterValentine/Digital-Garden";

export type FeedbackKind = "bug" | "feature" | "modification";

export interface FeedbackField {
  id: string;
  /** Section heading in the issue body — matches the template's bold heading. */
  heading: string;
  /** Shorter label shown above the textarea. */
  label: string;
  placeholder: string;
  required: boolean;
  /** Pre-filled starter text (e.g. a numbered list for reproduction steps). */
  starter?: string;
}

export interface FeedbackKindDefinition {
  kind: FeedbackKind;
  /** Segmented-control label. */
  label: string;
  /** One-line explanation under the control. */
  hint: string;
  /** The GitHub label the matching template applies. */
  githubLabel: string;
  /** Matching `.github/ISSUE_TEMPLATE/<file>`, for the drift check. */
  templateFile: string;
  /** Title prefix the template uses (empty when it has none). */
  titlePrefix: string;
  titlePlaceholder: string;
  fields: FeedbackField[];
}

export const FEEDBACK_KINDS: Record<FeedbackKind, FeedbackKindDefinition> = {
  bug: {
    kind: "bug",
    label: "Bug",
    hint: "Something isn't working the way it should.",
    githubLabel: "bug",
    templateFile: "bug_report.md",
    titlePrefix: "",
    titlePlaceholder: "Dragging a tab to the right pane snaps it back",
    fields: [
      {
        id: "description",
        heading: "Describe the bug",
        label: "What happened",
        placeholder: "A clear description of what went wrong.",
        required: true,
      },
      {
        id: "reproduce",
        heading: "To Reproduce",
        label: "Steps to reproduce",
        placeholder: "1. Go to …\n2. Click on …\n3. See …",
        required: false,
        starter: "1. \n2. \n3. ",
      },
      {
        id: "expected",
        heading: "Expected behavior",
        label: "What you expected",
        placeholder: "What should have happened instead?",
        required: false,
      },
      {
        id: "additional",
        heading: "Additional context",
        label: "Anything else",
        placeholder: "Frequency, workarounds, related notes…",
        required: false,
      },
    ],
  },
  feature: {
    kind: "feature",
    label: "Feature",
    hint: "An idea for something the app doesn't do yet.",
    githubLabel: "enhancement",
    templateFile: "feature_request.md",
    titlePrefix: "",
    titlePlaceholder: "Pin a folder to the top of the file tree",
    fields: [
      {
        id: "problem",
        heading: "Is your feature request related to a problem? Please describe.",
        label: "The problem",
        placeholder: "I'm always frustrated when …",
        required: true,
      },
      {
        id: "solution",
        heading: "Describe the solution you'd like",
        label: "What you'd like",
        placeholder: "What should the app do?",
        required: false,
      },
      {
        id: "alternatives",
        heading: "Describe alternatives you've considered",
        label: "Alternatives considered",
        placeholder: "Other approaches or workarounds you've tried.",
        required: false,
      },
      {
        id: "additional",
        heading: "Additional context",
        label: "Anything else",
        placeholder: "Examples, links, or how often you'd use it.",
        required: false,
      },
    ],
  },
  modification: {
    kind: "modification",
    label: "Small change",
    hint: "A targeted tweak to something that already exists.",
    githubLabel: "minor-modification",
    templateFile: "minor_modification.md",
    titlePrefix: "[Modification]: ",
    titlePlaceholder: "Show the word count in the status bar",
    fields: [
      {
        id: "existing",
        heading: "Existing feature",
        label: "Which feature",
        placeholder: "Which existing feature, page, or behavior?",
        required: true,
      },
      {
        id: "change",
        heading: "Requested modification",
        label: "The change",
        placeholder: "The specific change you'd like.",
        required: true,
      },
      {
        id: "reason",
        heading: "Reason for the change",
        label: "Why",
        placeholder: "What this improves or resolves.",
        required: false,
      },
      {
        id: "acceptance",
        heading: "Acceptance criteria",
        label: "Done when",
        placeholder: "- [ ] …\n- [ ] …",
        required: false,
        starter: "- [ ] \n- [ ] ",
      },
      {
        id: "outOfScope",
        heading: "Out of scope",
        label: "Leave unchanged",
        placeholder: "Anything related that should stay as it is.",
        required: false,
      },
      {
        id: "additional",
        heading: "Additional context",
        label: "Anything else",
        placeholder: "Other helpful details.",
        required: false,
      },
    ],
  },
};

export const FEEDBACK_KIND_ORDER: FeedbackKind[] = ["bug", "feature", "modification"];

/**
 * Area labels a submitter may pick. Every entry is an EXISTING label on the
 * repo — the API applies nothing outside this list, so a client can't attach
 * triage labels like `hard-bug` or `wontfix`.
 */
export const FEEDBACK_AREAS: ReadonlyArray<{ label: string; display: string }> = [
  { label: "Content Note", display: "Editor & notes" },
  { label: "Blocks", display: "Blocks" },
  { label: "Checklists", display: "Checklists" },
  { label: "Filetree", display: "File tree" },
  { label: "File Upload", display: "File upload" },
  { label: "Workspaces", display: "Workspaces" },
  { label: "Workspace Pane", display: "Panes & tabs" },
  { label: "AI Tool", display: "AI chat & tools" },
  { label: "Calendar", display: "Calendar" },
  { label: "Flashcards", display: "Flashcards" },
  { label: "TTS", display: "Read aloud" },
  { label: "Visualizations", display: "Diagrams" },
  { label: "Import", display: "Import" },
  { label: "collaboration", display: "Live collaboration" },
  { label: "browser extension", display: "Browser extension" },
  { label: "Mobile App", display: "Mobile app" },
];

/** The repo's existing high-severity label, applied when a bug blocks work or loses data. */
export const FEEDBACK_SEVERE_LABEL = "Fatal";

export const FEEDBACK_LIMITS = {
  title: 200,
  field: 6_000,
  areas: 4,
} as const;

/** Captured in the browser; shown to the submitter before anything is sent. */
export interface ClientDiagnostics {
  page?: string;
  viewport?: string;
  browser?: string;
  theme?: string;
  timeZone?: string;
}

/** Added by the server; the client never supplies these. */
export interface ServerDiagnostics {
  environment?: string;
  commit?: string;
  reporter?: string;
}

export interface FeedbackInput {
  kind: FeedbackKind;
  title: string;
  fields: Record<string, string>;
  areas: string[];
  /** Bug only: blocks work or lost data → the severe label. */
  severe?: boolean;
  diagnostics?: ClientDiagnostics | null;
}

export interface ComposedIssue {
  title: string;
  body: string;
  labels: string[];
}

const AREA_LABELS = new Set(FEEDBACK_AREAS.map((a) => a.label));

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** A field counts as filled only when it says more than its starter scaffold. */
export function isFieldFilled(field: FeedbackField, value: string | undefined): boolean {
  const v = (value ?? "").trim();
  if (!v) return false;
  return field.starter ? v !== field.starter.trim() : true;
}

/** Required fields still empty, by label, for the dialog's submit guard. */
export function missingRequired(input: Pick<FeedbackInput, "kind" | "title" | "fields">): string[] {
  const def = FEEDBACK_KINDS[input.kind];
  const missing: string[] = [];
  if (!input.title.trim()) missing.push("Title");
  for (const f of def.fields) {
    if (f.required && !isFieldFilled(f, input.fields[f.id])) missing.push(f.label);
  }
  return missing;
}

function diagnosticsRows(
  client: ClientDiagnostics | null | undefined,
  server: ServerDiagnostics | undefined,
): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ["Page", client?.page],
    ["Viewport", client?.viewport],
    ["Browser", client?.browser],
    ["Theme", client?.theme],
    ["Time zone", client?.timeZone],
    ["Environment", server?.environment],
    ["Commit", server?.commit],
    ["Reporter", server?.reporter],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]?.trim());
}

/**
 * Structured input → the issue GitHub receives. Pure and deterministic, so
 * the preview the submitter reads is byte-for-byte what gets filed (minus
 * the server-only diagnostics rows).
 */
export function composeIssue(input: FeedbackInput, server?: ServerDiagnostics): ComposedIssue {
  const def = FEEDBACK_KINDS[input.kind];
  const rawTitle = clamp(input.title.replace(/\s+/g, " "), FEEDBACK_LIMITS.title);
  const title =
    def.titlePrefix && !rawTitle.startsWith(def.titlePrefix)
      ? `${def.titlePrefix}${rawTitle}`
      : rawTitle;

  const sections: string[] = [];
  for (const f of def.fields) {
    const value = input.fields[f.id];
    if (!isFieldFilled(f, value)) continue;
    sections.push(`**${f.heading}**\n${clamp(value ?? "", FEEDBACK_LIMITS.field)}`);
  }

  const rows = diagnosticsRows(input.diagnostics, server);
  if (rows.length > 0) {
    const table = rows.map(([k, v]) => `| ${k} | ${v.replace(/\|/g, "\\|")} |`).join("\n");
    sections.push(
      `<details><summary>Diagnostics</summary>\n\n| | |\n|---|---|\n${table}\n\n</details>`,
    );
  }
  sections.push("<sub>Submitted from the in-app feedback form.</sub>");

  const labels = [def.githubLabel];
  for (const area of input.areas) {
    if (AREA_LABELS.has(area) && !labels.includes(area)) labels.push(area);
    if (labels.length > FEEDBACK_LIMITS.areas) break;
  }
  if (input.kind === "bug" && input.severe) labels.push(FEEDBACK_SEVERE_LABEL);

  return { title, body: sections.join("\n\n"), labels };
}

/** GitHub caps new-issue URLs around 8k characters; stay well under. */
const FALLBACK_URL_MAX = 7_500;

/**
 * The no-token path: GitHub's prefilled new-issue page. The submitter
 * finishes there (signed in to GitHub). No `template=` parameter: a named
 * template can replace the prefilled body, and the body here is already the
 * template's shape. GitHub applies `labels=` only for users with triage
 * access, so other submitters' issues arrive unlabeled. That's acceptable
 * for a fallback.
 */
export function buildGitHubNewIssueUrl(
  issue: ComposedIssue,
  repo: string = FEEDBACK_REPO_DEFAULT,
): string {
  const base = `https://github.com/${repo}/issues/new`;
  const make = (body: string) => {
    const params = new URLSearchParams({
      title: issue.title,
      body,
      labels: issue.labels.join(","),
    });
    return `${base}?${params.toString()}`;
  };
  let url = make(issue.body);
  if (url.length <= FALLBACK_URL_MAX) return url;
  const note = "\n\n…(trimmed to fit GitHub's link limit — please paste the rest here)";
  let body = issue.body;
  while (url.length > FALLBACK_URL_MAX && body.length > 200) {
    body = body.slice(0, Math.floor(body.length * 0.85));
    url = make(body + note);
  }
  return url;
}
