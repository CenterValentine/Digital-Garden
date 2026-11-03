/**
 * Canvas archive — the notes an import writes for things that aren't pages
 * (§5): an assignment carries its prompt AND what you did with it (your
 * submission, grade and the instructor's feedback); a discussion carries its
 * prompt and your own replies only (classmates' posts are their writing); a
 * quiz carries its description and your score (Canvas doesn't give students
 * the questions). Plus the syllabus header and the import report.
 *
 * Pure HTML builders; TipTap parses the result. Pinned by `pnpm canvas:check`.
 */

import { escapeHtml, wikiLinkHtml, type RefTarget } from "./html";

/** "2023-10-03 23:59 UTC" — unambiguous, and the same on every machine. */
export function formatCanvasDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function section(title: string, body: string): string {
  return `<h2>${escapeHtml(title)}</h2>${body}`;
}

function para(text: string): string {
  return `<p>${escapeHtml(text)}</p>`;
}

function htmlOrEmpty(html: string | null | undefined, empty: string): string {
  return html && html.replace(/<[^>]*>/g, "").trim() ? html : `<p><em>${escapeHtml(empty)}</em></p>`;
}

export interface SubmissionContent {
  workflowState: string | null;
  submittedAt: string | null;
  late: boolean;
  bodyHtml: string | null;
  url: string | null;
  /** Stored attachments link to their file nodes; a null target couldn't be stored. */
  attachments: Array<{ name: string; target: RefTarget | null }>;
  score: number | null;
  grade: string | null;
}

export interface FeedbackComment {
  author: string;
  createdAt: string | null;
  text: string;
}

export interface AssignmentContent {
  descriptionHtml: string | null;
  dueAt: string | null;
  pointsPossible: number | null;
  submission: SubmissionContent | null;
  comments: FeedbackComment[];
  /**
   * Set when the source can't carry your work at all (a course export holds
   * no submissions). Shown instead of the submission/grade/feedback sections,
   * so "not in this source" never reads as "you submitted nothing".
   */
  submissionUnavailable?: string;
}

export function composeAssignmentHtml(content: AssignmentContent): string {
  const facts: string[] = [];
  const due = formatCanvasDate(content.dueAt);
  if (due) facts.push(`Due: ${due}`);
  if (content.pointsPossible !== null) facts.push(`Points possible: ${content.pointsPossible}`);
  let html = facts.length ? para(facts.join(" · ")) : "";
  html += section("Assignment", htmlOrEmpty(content.descriptionHtml, "No description."));
  if (content.submissionUnavailable) {
    return html + section("My submission", `<p><em>${escapeHtml(content.submissionUnavailable)}</em></p>`);
  }

  const submission = content.submission;
  if (!submission || submission.workflowState === "unsubmitted" || (!submission.submittedAt && !submission.bodyHtml && !submission.url && !submission.attachments.length)) {
    html += section("My submission", para("Nothing was submitted."));
  } else {
    let body = "";
    const when = formatCanvasDate(submission.submittedAt);
    if (when) body += para(`Submitted ${when}${submission.late ? " (late)" : ""}`);
    if (submission.bodyHtml) body += submission.bodyHtml;
    if (submission.url) body += `<p><a href="${escapeHtml(submission.url)}">${escapeHtml(submission.url)}</a></p>`;
    if (submission.attachments.length) {
      body += `<ul>${submission.attachments
        .map((attachment) =>
          attachment.target
            ? `<li>${wikiLinkHtml(attachment.target, attachment.name)}</li>`
            : `<li><em>[file not captured: ${escapeHtml(attachment.name)}]</em></li>`
        )
        .join("")}</ul>`;
    }
    html += section("My submission", body || para("Submitted."));
  }

  const graded: string[] = [];
  if (submission?.score !== null && submission?.score !== undefined) {
    graded.push(
      content.pointsPossible !== null ? `Score: ${submission.score} / ${content.pointsPossible}` : `Score: ${submission.score}`
    );
  }
  if (submission?.grade && submission.grade !== String(submission.score)) graded.push(`Grade: ${submission.grade}`);
  html += section("Grade", para(graded.length ? graded.join(" · ") : "Not graded."));

  html += section(
    "Feedback",
    content.comments.length
      ? content.comments
          .map((comment) => {
            const when = formatCanvasDate(comment.createdAt);
            return `<blockquote><p><strong>${escapeHtml(comment.author)}</strong>${when ? ` · ${escapeHtml(when)}` : ""}</p>${para(comment.text)}</blockquote>`;
          })
          .join("")
      : para("No feedback comments.")
  );
  return html;
}

export interface DiscussionContent {
  promptHtml: string | null;
  postedAt: string | null;
  author: string | null;
  myReplies: Array<{ createdAt: string | null; html: string }>;
  /** The source can't carry replies at all (a course export): said instead. */
  repliesUnavailable?: string;
}

export function composeDiscussionHtml(content: DiscussionContent): string {
  const facts: string[] = [];
  if (content.author) facts.push(`Posted by ${content.author}`);
  const posted = formatCanvasDate(content.postedAt);
  if (posted) facts.push(posted);
  let html = facts.length ? para(facts.join(" · ")) : "";
  html += section("Prompt", htmlOrEmpty(content.promptHtml, "No prompt text."));
  if (content.repliesUnavailable) {
    return html + section("My replies", `<p><em>${escapeHtml(content.repliesUnavailable)}</em></p>`);
  }
  html += section(
    "My replies",
    content.myReplies.length
      ? content.myReplies
          .map((reply) => {
            const when = formatCanvasDate(reply.createdAt);
            return `${when ? `<p><strong>${escapeHtml(when)}</strong></p>` : ""}<blockquote>${htmlOrEmpty(reply.html, "(empty reply)")}</blockquote>`;
          })
          .join("")
      : para("You didn't reply in this discussion.")
  );
  return html;
}

export interface QuizContent {
  descriptionHtml: string | null;
  dueAt: string | null;
  pointsPossible: number | null;
  score: number | null;
}

export function composeQuizHtml(content: QuizContent): string {
  const facts: string[] = [];
  const due = formatCanvasDate(content.dueAt);
  if (due) facts.push(`Due: ${due}`);
  if (content.score !== null) {
    facts.push(content.pointsPossible !== null ? `Your score: ${content.score} / ${content.pointsPossible}` : `Your score: ${content.score}`);
  } else if (content.pointsPossible !== null) {
    facts.push(`Points possible: ${content.pointsPossible}`);
  }
  let html = facts.length ? para(facts.join(" · ")) : "";
  html += section("Quiz", htmlOrEmpty(content.descriptionHtml, "No description."));
  html += `<p><em>Quiz questions aren't available to students through Canvas, so they weren't imported.</em></p>`;
  return html;
}

export interface CourseAttribution {
  courseTitle: string;
  teachers: string[];
  term: string | null;
  /** "https://school.instructure.com" or "a course export (.imscc)". */
  sourceLabel: string;
  htmlUrl: string | null;
}

/** First lines of the syllabus note and the report: whose work this is (§2, §13.4). */
export function attributionHtml(attribution: CourseAttribution): string {
  const parts = [`Imported from ${attribution.sourceLabel}`];
  if (attribution.teachers.length) parts.push(`Instructor: ${attribution.teachers.join(", ")}`);
  if (attribution.term) parts.push(`Term: ${attribution.term}`);
  const link = attribution.htmlUrl ? ` · <a href="${escapeHtml(attribution.htmlUrl)}">Open in Canvas</a>` : "";
  return `<p><em>${escapeHtml(parts.join(" · "))}</em>${link}</p><p><em>Course materials are the instructor's work: kept here privately, for your own reference.</em></p>`;
}

export function composeSyllabusHtml(syllabusHtml: string, attribution: CourseAttribution): string {
  return attributionHtml(attribution) + htmlOrEmpty(syllabusHtml, "The syllabus is empty.");
}

export interface ReportContent {
  attribution: CourseAttribution;
  importedAt: string;
  kind: "import" | "re-import";
  counts: Record<string, number>;
  unmoduled?: { pages: number; files: number };
  problems: string[];
}

const COUNT_LABELS: Record<string, string> = {
  created: "Created",
  replaced: "Updated from Canvas",
  unchanged: "Unchanged",
  conflictsSkipped: "Kept your version (skipped)",
  siblingsAdded: "Canvas version added beside yours",
  removedUpstream: "No longer in Canvas (kept)",
  dismissed: "Skipped because you deleted them",
  failed: "Failed",
};

export function composeReportHtml(content: ReportContent): string {
  let html = attributionHtml(content.attribution);
  html += para(`Last ${content.kind}: ${formatCanvasDate(content.importedAt) ?? content.importedAt}`);
  const counts = Object.entries(content.counts)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `<li>${escapeHtml(COUNT_LABELS[key] ?? key)}: ${value}</li>`);
  html += section("Summary", counts.length ? `<ul>${counts.join("")}</ul>` : para("Nothing changed."));
  if (content.unmoduled && (content.unmoduled.pages || content.unmoduled.files)) {
    html += section(
      "Not in any module",
      para(
        `${content.unmoduled.pages} page(s) and ${content.unmoduled.files} file(s) exist in the course outside its modules and were not imported.`
      )
    );
  }
  html += section(
    "Not captured",
    content.problems.length
      ? `<ul>${content.problems.map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`
      : para("Everything in the imported modules was captured.")
  );
  return html;
}
