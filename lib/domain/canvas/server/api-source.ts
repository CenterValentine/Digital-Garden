/**
 * Canvas archive — the REST API source (server-only).
 *
 * A course as the enrolled user sees it: modules and their items in order,
 * each item's content, and the user's own work (submission, grade, feedback,
 * discussion replies). Versions come from the content listings' `updated_at`
 * so "check for changes" costs a handful of list calls, not a re-download.
 * A listing the account may not read (an instructor can hide Files) just
 * leaves those versions unknown; such items are never reported as changed.
 */

import "server-only";
import { stableHash } from "@/lib/core/stable-hash";
import {
  composeAssignmentHtml,
  composeDiscussionHtml,
  composeQuizHtml,
  type FeedbackComment,
} from "../compose";
import { createApiRefResolver } from "../refs";
import {
  CANVAS_FILE_SIZE_LIMIT,
  type CanvasItemType,
  type CourseSnapshot,
  type SnapshotItem,
  type SnapshotModule,
} from "../types";
import { CanvasError, type CanvasApi } from "./http";
import { CanvasFileTooLarge, mimeTypeFor, type CanvasSource, type FileBody, type StoreAttachment } from "./source";

// ── Canvas API shapes (only the fields we read) ──────────────────────────────

interface ApiCourse {
  id: number;
  name: string;
  course_code?: string | null;
  term?: { name?: string | null } | null;
  teachers?: Array<{ display_name?: string }>;
  syllabus_body?: string | null;
}

interface ApiModuleItem {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  page_url?: string;
  external_url?: string;
  html_url?: string;
  content_details?: { locked_for_user?: boolean; size?: number };
}

interface ApiModule {
  id: number;
  name: string;
  position: number;
  items?: ApiModuleItem[];
  items_count?: number;
}

interface ApiFile {
  id: number;
  url?: string;
  size?: number;
  "content-type"?: string;
  display_name?: string;
  filename?: string;
  updated_at?: string;
  locked_for_user?: boolean;
}

interface ApiSubmission {
  workflow_state?: string;
  submitted_at?: string | null;
  graded_at?: string | null;
  late?: boolean;
  body?: string | null;
  url?: string | null;
  score?: number | null;
  grade?: string | null;
  attachments?: ApiFile[];
  submission_comments?: Array<{ author_name?: string; created_at?: string; comment?: string }>;
}

interface ApiAssignment {
  id: number;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  updated_at?: string;
  submission?: ApiSubmission;
}

interface ApiDiscussionTopic {
  id: number;
  message?: string | null;
  posted_at?: string | null;
  last_reply_at?: string | null;
  updated_at?: string | null;
  user_name?: string | null;
  author?: { display_name?: string } | null;
}

interface ApiDiscussionEntry {
  user_id?: number;
  message?: string | null;
  created_at?: string | null;
  deleted?: boolean;
  replies?: ApiDiscussionEntry[];
}

interface ApiQuiz {
  id: number;
  description?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
}

const ITEM_TYPES: Record<string, CanvasItemType> = {
  Page: "page",
  File: "file",
  Assignment: "assignment",
  Discussion: "discussion",
  Quiz: "quiz",
  ExternalUrl: "external_url",
  ExternalTool: "external_tool",
  SubHeader: "subheader",
};

async function softList<T>(load: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await load();
  } catch (error) {
    // A listing the account can't read only costs us change detection.
    if (error instanceof CanvasError && (error.status === 403 || error.status === 404)) return null;
    throw error;
  }
}

export function createApiSource(api: CanvasApi, courseId: string): CanvasSource {
  const course = `/api/v1/courses/${encodeURIComponent(courseId)}`;
  let selfId: number | null = null;
  let syllabusBody = "";

  async function me(): Promise<number | null> {
    if (selfId === null) {
      const self = await api.get<{ id: number }>("/api/v1/users/self", {}, "your profile");
      selfId = self.id;
    }
    return selfId;
  }

  async function fileMeta(fileId: string): Promise<ApiFile> {
    try {
      return await api.get<ApiFile>(`${course}/files/${encodeURIComponent(fileId)}`, {}, "a course file");
    } catch (error) {
      if (error instanceof CanvasError && (error.status === 403 || error.status === 404)) {
        return api.get<ApiFile>(`/api/v1/files/${encodeURIComponent(fileId)}`, {}, "a course file");
      }
      throw error;
    }
  }

  async function downloadFile(meta: ApiFile): Promise<FileBody> {
    const fileName = meta.display_name || meta.filename || `file-${meta.id}`;
    if (meta.size && meta.size > CANVAS_FILE_SIZE_LIMIT) throw new CanvasFileTooLarge(fileName, meta.size);
    if (!meta.url || meta.locked_for_user) throw new CanvasError(`${fileName} is locked in Canvas`, 403);
    const { body, contentType } = await api.download(meta.url, CANVAS_FILE_SIZE_LIMIT);
    return { body, fileName, mimeType: mimeTypeFor(fileName, meta["content-type"] ?? contentType) };
  }

  async function assignmentHtml(id: string, storeAttachment: StoreAttachment): Promise<string> {
    const assignment = await api.get<ApiAssignment>(`${course}/assignments/${encodeURIComponent(id)}`, {}, "an assignment");
    let submission: ApiSubmission | null = null;
    try {
      submission = await api.get<ApiSubmission>(
        `${course}/assignments/${encodeURIComponent(id)}/submissions/self`,
        { "include[]": ["submission_comments"] },
        "your submission"
      );
    } catch (error) {
      if (!(error instanceof CanvasError && (error.status === 403 || error.status === 404))) throw error;
    }
    const attachments: Array<{ name: string; target: { contentId: string; title: string } | null }> = [];
    for (const attachment of submission?.attachments ?? []) {
      const name = attachment.display_name || attachment.filename || "attachment";
      try {
        attachments.push({ name, target: await storeAttachment(await downloadFile(attachment)) });
      } catch {
        attachments.push({ name, target: null });
      }
    }
    const comments: FeedbackComment[] = (submission?.submission_comments ?? [])
      .filter((comment) => comment.comment)
      .map((comment) => ({
        author: comment.author_name || "Instructor",
        createdAt: comment.created_at ?? null,
        text: comment.comment ?? "",
      }));
    return composeAssignmentHtml({
      descriptionHtml: assignment.description ?? null,
      dueAt: assignment.due_at ?? null,
      pointsPossible: assignment.points_possible ?? null,
      submission: submission
        ? {
            workflowState: submission.workflow_state ?? null,
            submittedAt: submission.submitted_at ?? null,
            late: Boolean(submission.late),
            bodyHtml: submission.body ?? null,
            url: submission.url ?? null,
            attachments,
            score: submission.score ?? null,
            grade: submission.grade ?? null,
          }
        : null,
      comments,
    });
  }

  async function discussionHtml(id: string): Promise<string> {
    const topic = await api.get<ApiDiscussionTopic>(
      `${course}/discussion_topics/${encodeURIComponent(id)}`,
      {},
      "a discussion"
    );
    const replies: Array<{ createdAt: string | null; html: string }> = [];
    try {
      const view = await api.get<{ view?: ApiDiscussionEntry[] }>(
        `${course}/discussion_topics/${encodeURIComponent(id)}/view`,
        {},
        "discussion replies"
      );
      const self = await me();
      const walk = (entries: ApiDiscussionEntry[] | undefined) => {
        for (const entry of entries ?? []) {
          if (!entry.deleted && entry.user_id === self && entry.message) {
            replies.push({ createdAt: entry.created_at ?? null, html: entry.message });
          }
          walk(entry.replies);
        }
      };
      walk(view.view);
    } catch (error) {
      if (!(error instanceof CanvasError && (error.status === 403 || error.status === 404))) throw error;
    }
    replies.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));
    return composeDiscussionHtml({
      promptHtml: topic.message ?? null,
      postedAt: topic.posted_at ?? null,
      author: topic.author?.display_name || topic.user_name || null,
      myReplies: replies,
    });
  }

  async function quizHtml(id: string): Promise<string> {
    const quiz = await api.get<ApiQuiz>(`${course}/quizzes/${encodeURIComponent(id)}`, {}, "a quiz");
    let score: number | null = null;
    try {
      const result = await api.get<{ quiz_submissions?: Array<{ score?: number | null; kept_score?: number | null }> }>(
        `${course}/quizzes/${encodeURIComponent(id)}/submissions`,
        {},
        "your quiz submission"
      );
      const latest = result.quiz_submissions?.[result.quiz_submissions.length - 1];
      score = latest?.kept_score ?? latest?.score ?? null;
    } catch (error) {
      if (!(error instanceof CanvasError && (error.status === 403 || error.status === 404))) throw error;
    }
    return composeQuizHtml({
      descriptionHtml: quiz.description ?? null,
      dueAt: quiz.due_at ?? null,
      pointsPossible: quiz.points_possible ?? null,
      score,
    });
  }

  return {
    kind: "api",
    sourceLabel: api.baseUrl,
    resolver: createApiRefResolver(api.baseUrl),

    async snapshot(): Promise<CourseSnapshot> {
      const info = await api.get<ApiCourse>(
        course,
        { "include[]": ["term", "teachers", "syllabus_body"] },
        "this course"
      );
      syllabusBody = info.syllabus_body ?? "";

      const apiModules = await api.getAll<ApiModule>(
        `${course}/modules`,
        { "include[]": ["items", "content_details"] },
        "the course modules"
      );
      // Canvas omits `items` for very large modules: fetch those separately.
      for (const courseModule of apiModules) {
        if (!courseModule.items) {
          courseModule.items = await api.getAll<ApiModuleItem>(
            `${course}/modules/${courseModule.id}/items`,
            { "include[]": ["content_details"] },
            "a module's items"
          );
        }
      }
      apiModules.sort((a, b) => a.position - b.position);

      // Versions, from the listings (best effort).
      const pages = await softList(() => api.getAll<{ url: string; updated_at?: string }>(`${course}/pages`, {}, "the pages list"));
      const files = await softList(() => api.getAll<ApiFile>(`${course}/files`, {}, "the files list"));
      const assignments = await softList(() =>
        api.getAll<ApiAssignment>(`${course}/assignments`, { "include[]": ["submission"] }, "the assignments list")
      );
      const topics = await softList(() => api.getAll<ApiDiscussionTopic>(`${course}/discussion_topics`, {}, "the discussions list"));
      const quizzes = await softList(() => api.getAll<ApiQuiz & Record<string, unknown>>(`${course}/quizzes`, {}, "the quizzes list"));

      const pageVersion = new Map((pages ?? []).map((page) => [page.url.toLowerCase(), page.updated_at ?? null]));
      const fileInfo = new Map((files ?? []).map((file) => [String(file.id), file]));
      const assignmentVersion = new Map(
        (assignments ?? []).map((assignment) => [
          String(assignment.id),
          [
            assignment.updated_at ?? "",
            assignment.submission?.submitted_at ?? "",
            assignment.submission?.graded_at ?? "",
            assignment.submission?.workflow_state ?? "",
          ].join("|"),
        ])
      );
      const topicVersion = new Map(
        (topics ?? []).map((topic) => [
          String(topic.id),
          `${topic.updated_at ?? topic.posted_at ?? ""}|${topic.last_reply_at ?? ""}`,
        ])
      );
      const quizVersion = new Map((quizzes ?? []).map((quiz) => [String(quiz.id), stableHash(quiz).slice(0, 32)]));

      const moduledPages = new Set<string>();
      const moduledFiles = new Set<string>();
      const modules: SnapshotModule[] = apiModules.map((courseModule) => ({
        id: String(courseModule.id),
        title: courseModule.name || "Module",
        items: (courseModule.items ?? []).flatMap((apiItem): SnapshotItem[] => {
          const type = ITEM_TYPES[apiItem.type];
          if (!type) return [];
          const contentId = apiItem.content_id !== undefined ? String(apiItem.content_id) : null;
          const item: SnapshotItem = {
            key: String(apiItem.id),
            type,
            title: apiItem.title || "Untitled",
            version: null,
            refKey: null,
            ref: null,
            htmlUrl: apiItem.html_url ?? null,
            locked: Boolean(apiItem.content_details?.locked_for_user),
          };
          switch (type) {
            case "page": {
              const slug = (apiItem.page_url ?? "").toLowerCase();
              moduledPages.add(slug);
              item.ref = slug;
              item.refKey = slug ? `page:${slug}` : null;
              item.version = pageVersion.get(slug) ?? null;
              break;
            }
            case "file": {
              if (contentId) moduledFiles.add(contentId);
              const info = contentId ? fileInfo.get(contentId) : undefined;
              item.ref = contentId;
              item.refKey = contentId ? `file:${contentId}` : null;
              item.version = info?.updated_at ?? null;
              item.size = info?.size ?? apiItem.content_details?.size ?? null;
              break;
            }
            case "assignment":
              item.ref = contentId;
              item.refKey = contentId ? `assignment:${contentId}` : null;
              item.version = contentId ? assignmentVersion.get(contentId) ?? null : null;
              break;
            case "discussion":
              item.ref = contentId;
              item.refKey = contentId ? `discussion:${contentId}` : null;
              item.version = contentId ? topicVersion.get(contentId) ?? null : null;
              break;
            case "quiz":
              item.ref = contentId;
              item.refKey = contentId ? `quiz:${contentId}` : null;
              item.version = contentId ? quizVersion.get(contentId) ?? null : null;
              break;
            case "external_url":
            case "external_tool":
              item.externalUrl = apiItem.external_url || apiItem.html_url || null;
              item.ref = item.externalUrl;
              item.version = item.externalUrl ? stableHash(item.externalUrl).slice(0, 32) : null;
              break;
            case "subheader":
              break;
          }
          return [item];
        }),
      }));

      return {
        source: "api",
        courseId: String(info.id),
        name: info.name,
        courseCode: info.course_code ?? null,
        term: info.term?.name ?? null,
        teachers: (info.teachers ?? []).map((teacher) => teacher.display_name ?? "").filter(Boolean),
        htmlUrl: `${api.baseUrl}/courses/${info.id}`,
        syllabus: syllabusBody.replace(/<[^>]*>/g, "").trim() ? { version: stableHash(syllabusBody).slice(0, 32) } : null,
        modules,
        unmoduled: {
          pages: pages ? pages.filter((page) => !moduledPages.has(page.url.toLowerCase())).length : 0,
          files: files ? files.filter((file) => !moduledFiles.has(String(file.id))).length : 0,
        },
      };
    },

    async syllabusHtml() {
      return syllabusBody;
    },

    async noteHtml(item, storeAttachment) {
      if (!item.ref) throw new CanvasError(`${item.title} has no content to fetch`, 404);
      switch (item.type) {
        case "page": {
          const page = await api.get<{ body?: string | null }>(`${course}/pages/${encodeURIComponent(item.ref)}`, {}, "a page");
          return page.body ?? "";
        }
        case "assignment":
          return assignmentHtml(item.ref, storeAttachment);
        case "discussion":
          return discussionHtml(item.ref);
        case "quiz":
          return quizHtml(item.ref);
        default:
          throw new CanvasError(`${item.title} isn't a note`, 400);
      }
    },

    async file(item) {
      if (!item.ref) throw new CanvasError(`${item.title} has no file`, 404);
      return downloadFile(await fileMeta(item.ref));
    },

    async fileForUrl(src) {
      const refKey = createApiRefResolver(api.baseUrl).refKeyOf(src);
      try {
        if (refKey?.startsWith("file:")) return await downloadFile(await fileMeta(refKey.slice("file:".length)));
        const { body, contentType } = await api.fetchSameOrigin(src, CANVAS_FILE_SIZE_LIMIT);
        const name = decodeURIComponent(src.split(/[?#]/)[0].split("/").pop() || "image");
        return { body, fileName: name, mimeType: mimeTypeFor(name, contentType) };
      } catch {
        return null;
      }
    },
  };
}
