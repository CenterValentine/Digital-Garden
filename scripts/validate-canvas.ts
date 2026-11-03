/**
 * Canvas archive gate (CANVAS-ARCHIVE-PLAN.md §12) — `pnpm canvas:check`.
 *
 * Fixture-based, no network, no database:
 *   1. The planner: first import, every re-import rule (replace, conflict,
 *      unchanged, dismissed, removed upstream), module scope, SubHeader
 *      grouping, retitling, per-module change counts.
 *   2. The ordering rule: the user's notes stay attached to the item above.
 *   3. The edit fingerprint: reading a note (ids, attr defaults) is not editing it.
 *   4. HTML rewriting for both sources: wiki-links, stored images, visible gaps.
 *   5. The note composers: "not in this source" never reads as "you did nothing".
 *   6. A Common Cartridge built in memory parses to the expected snapshot.
 *   7. The lock seams: every route/tool that can rename, move or publish a
 *      node asks the lock. The list below IS the contract — add a seam here
 *      when you add one.
 *
 * Run: pnpm canvas:check
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import JSZip from "jszip";
import {
  COURSE_LINK_KEY,
  SYLLABUS_LINK_KEY,
  itemLinkKey,
  moduleLinkKey,
  planCourse,
  summarizeChanges,
  type ExistingLink,
} from "@/lib/domain/canvas/plan";
import { mergeOrder } from "@/lib/domain/canvas/order";
import { noteFingerprintValue } from "@/lib/domain/canvas/fingerprint";
import { listImageSources, rewriteCanvasHtml } from "@/lib/domain/canvas/html";
import { createApiRefResolver, createCartridgeRefResolver } from "@/lib/domain/canvas/refs";
import { composeAssignmentHtml, composeDiscussionHtml, formatCanvasDate } from "@/lib/domain/canvas/compose";
import { cartridgeItemHtml, parseCartridge } from "@/lib/domain/canvas/cartridge";
import { courseFolderTitle, type CourseSnapshot } from "@/lib/domain/canvas/types";

let failures = 0;
let checks = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  checks += 1;
  if (!condition) {
    failures += 1;
    console.error(`  FAIL  ${label}${detail !== undefined ? ` — got: ${JSON.stringify(detail)}` : ""}`);
  }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── 1. Planner ───────────────────────────────────────────────────────────────

const snapshot: CourseSnapshot = {
  source: "api",
  courseId: "42",
  name: "Cell Biology",
  courseCode: "BIO 201",
  term: "Fall 2023",
  teachers: ["Dr. Rivera"],
  htmlUrl: "https://school.instructure.com/courses/42",
  syllabus: { version: "s1" },
  modules: [
    {
      id: "m1",
      title: "Membranes",
      items: [
        { key: "i1", type: "page", title: "Lipid Bilayers", version: "v1", refKey: "page:lipid-bilayers", ref: "lipid-bilayers" },
        { key: "i2", type: "subheader", title: "Week 1", version: null, refKey: null, ref: null },
        { key: "i3", type: "file", title: "slides.pdf", version: "f1", refKey: "file:7", ref: "7" },
        { key: "i4", type: "assignment", title: "Problem Set 1", version: "a1", refKey: "assignment:9", ref: "9" },
      ],
    },
    {
      id: "m2",
      title: "Transport",
      items: [{ key: "i5", type: "external_url", title: "Khan: Diffusion", version: "x1", refKey: null, ref: "https://khan.org", externalUrl: "https://khan.org" }],
    },
  ],
};

check("course folder title joins code, name and term", courseFolderTitle(snapshot) === "BIO 201 — Cell Biology (Fall 2023)", courseFolderTitle(snapshot));
check(
  "course folder title doesn't repeat a code already in the name",
  courseFolderTitle({ name: "BIO 201: Cells", courseCode: "BIO 201", term: null }) === "BIO 201: Cells"
);

{
  const plan = planCourse({ snapshot, existing: [], scope: { modules: "all", course: true } });
  const keys = plan.nodes.map((node) => node.linkKey);
  check(
    "first import plans parents before children, in Canvas order",
    same(keys, [COURSE_LINK_KEY, SYLLABUS_LINK_KEY, "module:m1", "item:i1", "item:i2", "item:i3", "item:i4", "module:m2", "item:i5"]),
    keys
  );
  check("first import creates everything", plan.nodes.every((node) => node.action === "create"));
  const byKey = new Map(plan.nodes.map((node) => [node.linkKey, node]));
  check("a SubHeader becomes a folder", byKey.get("item:i2")?.kind === "folder");
  check("items below a SubHeader nest in it", byKey.get("item:i3")?.parentLinkKey === "item:i2" && byKey.get("item:i4")?.parentLinkKey === "item:i2");
  check("items above a SubHeader stay in the module", byKey.get("item:i1")?.parentLinkKey === "module:m1");
  check("positions restart inside a SubHeader", byKey.get("item:i3")?.position === 0 && byKey.get("item:i4")?.position === 1);
  check("syllabus comes first in the course", byKey.get(SYLLABUS_LINK_KEY)?.position === 0 && (byKey.get("module:m1")?.position ?? 0) > 0);
  check("node kinds follow item types", byKey.get("item:i3")?.kind === "file" && byKey.get("item:i5")?.kind === "external" && byKey.get("item:i4")?.kind === "note");
}

function link(partial: Partial<ExistingLink> & { linkKey: string }): ExistingLink {
  return {
    canvasType: "page",
    contentId: `node-${partial.linkKey}`,
    moduleId: "m1",
    remoteVersion: null,
    importedHash: "h",
    status: "linked",
    nodeTitle: null,
    inTrash: false,
    currentHash: "h",
    ...partial,
  };
}

{
  const existing: ExistingLink[] = [
    link({ linkKey: COURSE_LINK_KEY, canvasType: "course", moduleId: null, nodeTitle: "BIO 201 — Cell Biology (Fall 2023)" }),
    link({ linkKey: SYLLABUS_LINK_KEY, canvasType: "syllabus", moduleId: null, contentId: null, remoteVersion: "s0" }),
    link({ linkKey: moduleLinkKey("m1"), canvasType: "module", nodeTitle: "Old name" }),
    link({ linkKey: itemLinkKey("i1"), remoteVersion: "v0", importedHash: "h1", currentHash: "h1", nodeTitle: "Lipid Bilayers" }),
    link({ linkKey: itemLinkKey("i3"), canvasType: "file", remoteVersion: "f0", importedHash: "h3", currentHash: "edited" }),
    link({ linkKey: itemLinkKey("i4"), canvasType: "assignment", remoteVersion: "a1" }),
    link({ linkKey: itemLinkKey("i9"), canvasType: "page", nodeTitle: "Gone page" }),
    link({ linkKey: itemLinkKey("i8"), canvasType: "page", moduleId: "m2", nodeTitle: "Gone from m2" }),
  ];
  const plan = planCourse({ snapshot, existing, scope: { modules: "all", course: true } });
  const byKey = new Map(plan.nodes.map((node) => [node.linkKey, node]));
  check("changed upstream + untouched copy → replace", byKey.get("item:i1")?.action === "replace", byKey.get("item:i1")?.action);
  check("changed upstream + edited copy → conflict", byKey.get("item:i3")?.action === "conflict", byKey.get("item:i3")?.action);
  check("an unanswered conflict defaults to skip", byKey.get("item:i3")?.resolution === "skip");
  check("same version → unchanged", byKey.get("item:i4")?.action === "unchanged");
  check("a purged node stays dismissed", byKey.get(SYLLABUS_LINK_KEY)?.action === "dismissed");
  check("a never-imported item → create", byKey.get("item:i2")?.action === "create");
  check("Canvas renamed it → retitle", byKey.get("module:m1")?.retitle === true);
  check("same title → no retitle", byKey.get("item:i1")?.retitle === false);
  check(
    "removed upstream lists items Canvas no longer has, in scope",
    same(plan.removedUpstream.map((removed) => removed.linkKey).sort(), ["item:i8", "item:i9"]),
    plan.removedUpstream
  );
  check("conflicts list the conflict", same(plan.conflicts.map((node) => node.linkKey), ["item:i3"]));

  const answered = planCourse({ snapshot, existing, scope: { modules: "all", course: true }, resolutions: { "item:i3": "sibling" } });
  check("an answered conflict carries the answer", answered.nodes.find((node) => node.linkKey === "item:i3")?.resolution === "sibling");

  const scoped = planCourse({ snapshot, existing, scope: { modules: ["m2"], course: false } });
  const scopedByKey = new Map(scoped.nodes.map((node) => [node.linkKey, node]));
  check("out-of-scope modules are still planned (link targets)", scopedByKey.get("item:i1")?.inScope === false);
  check("in-scope modules are marked in scope", scopedByKey.get("item:i5")?.inScope === true);
  check("conflicts outside scope aren't asked about", scoped.conflicts.length === 0);
  check("removed upstream respects scope", same(scoped.removedUpstream.map((removed) => removed.linkKey), ["item:i8"]), scoped.removedUpstream);
  check("the syllabus is out of scope unless the course is", scopedByKey.get(SYLLABUS_LINK_KEY)?.inScope === false);

  const summary = summarizeChanges(plan, existing);
  const m1 = summary.modules.find((module_) => module_.moduleId === "m1");
  check("per-module counts", m1?.replaced === 1 && m1?.conflicts === 1 && m1?.created === 1 && m1?.removed === 1, m1);
  check("module title in the summary", m1?.title === "Membranes");

  const noHash = planCourse({
    snapshot,
    existing: [link({ linkKey: itemLinkKey("i1"), remoteVersion: "v0", importedHash: null, currentHash: "x" })],
    scope: { modules: "all", course: true },
  });
  check(
    "no recorded hash can't prove untouched → conflict",
    noHash.nodes.find((node) => node.linkKey === "item:i1")?.action === "conflict"
  );

  const unknownVersion = planCourse({
    snapshot: { ...snapshot, modules: [{ ...snapshot.modules[0], items: [{ ...snapshot.modules[0].items[0], version: null }] }] },
    existing: [link({ linkKey: itemLinkKey("i1"), remoteVersion: "v0", importedHash: "h", currentHash: "h" })],
    scope: { modules: "all", course: true },
  });
  check(
    "an unreadable version is never reported as a change",
    unknownVersion.nodes.find((node) => node.linkKey === "item:i1")?.action === "unchanged"
  );

  const trashedModule = planCourse({
    snapshot,
    existing: [link({ linkKey: moduleLinkKey("m1"), canvasType: "module", inTrash: true })],
    scope: { modules: "all", course: true },
  });
  check(
    "a deleted module folder dismisses everything in it",
    trashedModule.nodes.filter((node) => node.moduleId === "m1").every((node) => node.action === "dismissed")
  );
}

// ── 2. Ordering ─────────────────────────────────────────────────────────────

check(
  "user notes stay after the item above them when Canvas reorders",
  same(mergeOrder(["A", "mine1", "B", "mine2"], ["B", "A"]), ["B", "mine2", "A", "mine1"]),
  mergeOrder(["A", "mine1", "B", "mine2"], ["B", "A"])
);
check("notes above every item stay at the top", same(mergeOrder(["top", "A", "B"], ["A", "B"]), ["top", "A", "B"]));
check("new items arrive with nothing attached", same(mergeOrder(["A", "mine"], ["A", "N"]), ["A", "mine", "N"]));
check(
  "an item Canvas removed is kept, attached like the user's own",
  same(mergeOrder(["A", "gone", "B"], ["A", "B"]), ["A", "gone", "B"])
);
check("every id appears exactly once", new Set(mergeOrder(["A", "x", "B", "y"], ["B", "C", "A"])).size === 5);

// ── 3. Fingerprint ──────────────────────────────────────────────────────────

{
  const imported = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Assignment" }] },
      { type: "paragraph", content: [{ type: "text", text: "Read ", marks: [{ type: "bold" }] }] },
    ],
  };
  const opened = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2, id: "abc", collapsed: false, blockId: "b1" }, content: [{ type: "text", text: "Assignment" }] },
      { type: "paragraph", attrs: { blockId: "b2", textAlign: null }, content: [{ type: "text", text: "Read ", marks: [{ type: "bold", attrs: {} }] }] },
      { type: "paragraph" },
    ],
  };
  const edited = {
    ...imported,
    content: [...imported.content, { type: "paragraph", content: [{ type: "text", text: "My note" }] }],
  };
  check("opening a note (ids, defaults, trailing paragraph) isn't editing it", same(noteFingerprintValue(imported), noteFingerprintValue(opened)));
  check("typing in a note is editing it", !same(noteFingerprintValue(imported), noteFingerprintValue(edited)));
  const relinked = JSON.parse(JSON.stringify(imported));
  relinked.content[1].content[0].marks = [{ type: "link", attrs: { href: "https://a.example" } }];
  check("changing a link target is editing it", !same(noteFingerprintValue(imported), noteFingerprintValue(relinked)));
}

// ── 4. HTML rewriting ───────────────────────────────────────────────────────

{
  const resolver = createApiRefResolver("https://school.instructure.com");
  check("API: relative page link → page refKey", resolver.refKeyOf("/courses/42/pages/Lipid-Bilayers#top") === "page:lipid-bilayers");
  check("API: absolute file preview → file refKey", resolver.refKeyOf("https://school.instructure.com/courses/42/files/7/preview?verifier=x") === "file:7");
  check("API: api/v1 endpoints resolve too", resolver.refKeyOf("https://school.instructure.com/api/v1/courses/42/assignments/9") === "assignment:9");
  check("API: module item link → item refKey", resolver.refKeyOf("/courses/42/modules/items/5") === "item:5");
  check("API: other hosts aren't Canvas", resolver.refKeyOf("https://khan.org/courses/1/pages/x") === null && !resolver.isInternal("https://khan.org/x"));
  check("API: same-host pages are internal even unresolved", resolver.isInternal("/courses/42/grades"));

  const html = [
    `<p>See <a href="/courses/42/pages/lipid-bilayers">the &amp; reading</a>.</p>`,
    `<p><a href="/courses/42/files/7/download"><img src="/courses/42/files/7/preview" alt="diagram"></a></p>`,
    `<p><a href="/courses/42/grades">Grades</a> and <a href="https://khan.org">Khan</a></p>`,
    `<p><img src="/equation_images/x%2By" alt="x+y"> <img src="https://cdn.example/a.png"></p>`,
    `<iframe src="https://school.instructure.com/media/1" title="Lecture video"></iframe>`,
    `<script>alert(1)</script>`,
  ].join("");
  check("image sources are listed once each", same(listImageSources(html), ["/courses/42/files/7/preview", "/equation_images/x%2By", "https://cdn.example/a.png"]));
  const result = rewriteCanvasHtml({
    html,
    resolver,
    targets: new Map([
      ["page:lipid-bilayers", { contentId: "n-page", title: "Lipid Bilayers" }],
      ["file:7", { contentId: "n-file", title: "slides.pdf" }],
    ]),
    images: new Map([["/courses/42/files/7/preview", "n-file"]]),
  });
  check(
    "an internal link to an imported page becomes a wiki-link with the link's text",
    result.html.includes(`<span data-type="wiki-link" data-target-id="n-page" data-target-title="Lipid Bilayers" data-display-text="the &amp; reading">the &amp; reading</span>`),
    result.html
  );
  check("a stored image points at our copy", result.html.includes(`src="/api/content/content/n-file/download?stream=true" data-content-id="n-file"`), result.html);
  check("a link wrapping an image keeps its <a>", /<a href="\/courses\/42\/files\/7\/download">/.test(result.html));
  check("an internal link we couldn't import is kept, absolute, and marked", result.html.includes(`<a href="https://school.instructure.com/courses/42/grades">Grades</a> <em>(not imported)</em>`), result.html);
  check("an external link is untouched", result.html.includes(`<a href="https://khan.org">Khan</a>`));
  check("an internal image we couldn't store leaves a visible gap", result.html.includes("[image not captured: x+y]") && same(result.unresolvedImages, ["/equation_images/x%2By"]));
  check("an external image is kept", result.html.includes(`<img src="https://cdn.example/a.png">`));
  check("an embed becomes a marked link", result.html.includes("(embedded content not captured)") && result.droppedEmbeds.length === 1);
  check("scripts are dropped", !result.html.includes("alert(1)"));
  check("unresolved links are reported", same(result.unresolvedLinks, ["/courses/42/grades"]), result.unresolvedLinks);

  const cartridge = createCartridgeRefResolver();
  check("cartridge: wiki reference → page refKey", cartridge.refKeyOf("$WIKI_REFERENCE$/pages/Lipid-Bilayers") === "page:lipid-bilayers");
  check(
    "cartridge: encoded file base → decoded path",
    cartridge.refKeyOf("%24IMS-CC-FILEBASE%24/Week%201/a%20b.pdf?canvas_download=1") === "filepath:Week 1/a b.pdf",
    cartridge.refKeyOf("%24IMS-CC-FILEBASE%24/Week%201/a%20b.pdf?canvas_download=1")
  );
  check("cartridge: object reference → assignment refKey", cartridge.refKeyOf("$CANVAS_OBJECT_REFERENCE$/assignments/g123") === "assignment:g123");
  check("cartridge: real URLs aren't internal", !cartridge.isInternal("https://khan.org"));
}

// ── 5. Composers ────────────────────────────────────────────────────────────

{
  const base = { descriptionHtml: "<p>Do it</p>", dueAt: "2023-10-03T23:59:00Z", pointsPossible: 10, comments: [] };
  const fromExport = composeAssignmentHtml({ ...base, submission: null, submissionUnavailable: "Not in exports." });
  check("export: 'not in this source' never reads as 'nothing submitted'", fromExport.includes("Not in exports.") && !fromExport.includes("Nothing was submitted"));
  const none = composeAssignmentHtml({ ...base, submission: null });
  check("API with no submission says so", none.includes("Nothing was submitted"));
  const done = composeAssignmentHtml({
    ...base,
    submission: {
      workflowState: "graded",
      submittedAt: "2023-10-02T12:00:00Z",
      late: false,
      bodyHtml: null,
      url: null,
      attachments: [
        { name: "essay.docx", target: { contentId: "n-essay", title: "essay.docx" } },
        { name: "big.mov", target: null },
      ],
      score: 9,
      grade: "A",
    },
    comments: [{ author: "Dr. Rivera", createdAt: null, text: "Nice <work>" }],
  });
  check("a submission links its stored attachments", done.includes(`data-target-id="n-essay"`));
  check("an attachment we couldn't store leaves a visible gap", done.includes("[file not captured: big.mov]"));
  check("score and grade are shown", done.includes("Score: 9 / 10") && done.includes("Grade: A"));
  check("feedback is escaped", done.includes("Nice &lt;work&gt;"));
  check("dates are unambiguous", formatCanvasDate("2023-10-03T23:59:00Z") === "2023-10-03 23:59 UTC");
  const discussion = composeDiscussionHtml({ promptHtml: "<p>Q</p>", postedAt: null, author: null, myReplies: [], repliesUnavailable: "Not in exports." });
  check("export discussions say replies aren't in the source", discussion.includes("Not in exports.") && !discussion.includes("You didn't reply"));
}

// ── 6. Common Cartridge ─────────────────────────────────────────────────────

async function cartridgeChecks() {
  const zip = new JSZip();
  zip.file(
    "imsmanifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man1" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata><lom><general><title><string>LOM Title</string></title></general></lom></metadata>
  <organizations><organization identifier="org_1"><item identifier="LearningModules">
    <item identifier="mod1"><title>Week 1</title>
      <item identifier="it1" identifierref="res_page"><title>Intro</title></item>
    </item>
  </item></organization></organizations>
  <resources>
    <resource identifier="res_page" type="webcontent" href="wiki_content/intro.html"><file href="wiki_content/intro.html"/></resource>
    <resource identifier="res_file" type="webcontent" href="web_resources/Docs/notes.pdf"><file href="web_resources/Docs/notes.pdf"/></resource>
    <resource identifier="res_disc" type="imsdt_xmlv1p1"><file href="res_disc.xml"/></resource>
    <resource identifier="res_asg" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="res_asg/essay.html">
      <file href="res_asg/essay.html"/><file href="res_asg/assignment_settings.xml"/>
    </resource>
  </resources>
</manifest>`
  );
  zip.file(
    "course_settings/course_settings.xml",
    `<?xml version="1.0"?><course identifier="gcourse1" xmlns="http://canvas.instructure.com/xsd/cccv1p0"><title>Cell Biology</title><course_code>BIO 201</course_code></course>`
  );
  zip.file(
    "course_settings/module_meta.xml",
    `<?xml version="1.0"?><modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="mod1"><title>Week 1</title><position>1</position><items>
    <item identifier="it2"><content_type>ContextModuleSubHeader</content_type><title>Readings</title><position>2</position></item>
    <item identifier="it1"><content_type>WikiPage</content_type><title>Intro</title><identifierref>res_page</identifierref><position>1</position></item>
    <item identifier="it3"><content_type>Attachment</content_type><title>notes.pdf</title><identifierref>res_file</identifierref><position>3</position></item>
    <item identifier="it4"><content_type>ExternalUrl</content_type><title>Khan</title><url>https://khan.org</url><position>4</position></item>
    <item identifier="it5"><content_type>DiscussionTopic</content_type><title>Discuss</title><identifierref>res_disc</identifierref><position>5</position></item>
    <item identifier="it6"><content_type>Assignment</content_type><title>Essay</title><identifierref>res_asg</identifierref><position>6</position></item>
  </items></module>
</modules>`
  );
  zip.file("course_settings/syllabus.html", `<html><body><p>Welcome</p></body></html>`);
  zip.file("wiki_content/intro.html", `<html><head><title>Intro</title></head><body><p>Hello <a href="$WIKI_REFERENCE$/pages/intro">self</a></p></body></html>`);
  zip.file("web_resources/Docs/notes.pdf", "%PDF-1.4 fake");
  zip.file("res_disc.xml", `<?xml version="1.0"?><topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"><title>Discuss</title><text texttype="text/html">&lt;p&gt;What do you think?&lt;/p&gt;</text></topic>`);
  zip.file("res_asg/essay.html", `<html><body><p>Write 500 words</p></body></html>`);
  zip.file("res_asg/assignment_settings.xml", `<?xml version="1.0"?><assignment identifier="res_asg"><due_at>2023-10-03T23:59:00</due_at><points_possible>25.0</points_possible></assignment>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });

  const parsed = await parseCartridge(bytes);
  const snap = parsed.snapshot;
  check("cartridge: course identity from course_settings", snap.courseId === "gcourse1" && snap.name === "Cell Biology" && snap.courseCode === "BIO 201", snap);
  check("cartridge: syllabus detected", snap.syllabus !== null && parsed.syllabusHtml === "<p>Welcome</p>");
  const items = snap.modules[0]?.items ?? [];
  check(
    "cartridge: module_meta order and types",
    same(items.map((item) => item.type), ["page", "subheader", "file", "external_url", "discussion", "assignment"]),
    items.map((item) => item.type)
  );
  check("cartridge: page refKey from its file name", items[0]?.refKey === "page:intro");
  check("cartridge: file refKey relative to web_resources", items[2]?.refKey === "filepath:Docs/notes.pdf");
  check("cartridge: external URL carried", items[3]?.externalUrl === "https://khan.org");
  check("cartridge: content items have versions", items.filter((item) => item.type !== "subheader").every((item) => item.version !== null));
  const discussion = await cartridgeItemHtml(parsed, items[4]);
  check("cartridge: discussion prompt HTML is decoded", discussion.html === "<p>What do you think?</p>", discussion.html);
  const assignment = await cartridgeItemHtml(parsed, items[5]);
  check("cartridge: assignment body and settings", assignment.html === "<p>Write 500 words</p>" && assignment.pointsPossible === 25 && assignment.dueAt === "2023-10-03T23:59:00", assignment);
  const page = await cartridgeItemHtml(parsed, items[0]);
  check("cartridge: page body without the document shell", page.html.startsWith("<p>Hello"), page.html);

  const plan = planCourse({ snapshot: snap, existing: [], scope: { modules: "all", course: true } });
  check("cartridge snapshot plans like an API snapshot", plan.nodes.some((node) => node.linkType === "subheader" && node.kind === "folder"));

  let rejected = false;
  try {
    await parseCartridge(new TextEncoder().encode("not a zip"));
  } catch {
    rejected = true;
  }
  check("a file that isn't a zip is refused clearly", rejected);
}

// ── 7. Lock seams ───────────────────────────────────────────────────────────

const SEAMS: Array<[string, RegExp, string]> = [
  ["app/api/content/content/[id]/route.ts", /canvasTitleLockRefusal\(/, "PATCH title"],
  ["app/api/content/content/[id]/route.ts", /canvasMoveRefusal\(/, "PATCH parentId"],
  ["app/api/content/content/[id]/route.ts", /canvasPublishRefusal\(/, "PATCH isPublished"],
  ["app/api/content/content/move/route.ts", /canvasMoveRefusal\(/, "move"],
  ["lib/domain/ai/tools/registry.ts", /canvasTitleLockRefusal\(/, "AI rename_note"],
  ["app/api/publishing/items/route.ts", /canvasPublishRefusal\(/, "create public item"],
  ["app/api/publishing/items/[id]/publish/route.ts", /canvasPublishRefusal\(/, "publish item"],
  // The UI reflects the lock (the server enforces it regardless).
  ["app/api/content/content/tree/route.ts", /titleLocked/, "tree sends titleLocked"],
  ["components/content/FileTree.tsx", /node\.data\.titleLocked/, "⌥R skips locked rows"],
  ["components/content/context-menu/file-tree-actions.tsx", /titleLocked === true/, "menu greys Rename"],
];
for (const [file, pattern, label] of SEAMS) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  check(`seam ${label} (${file}) asks the Canvas lock`, pattern.test(source));
}

cartridgeChecks()
  .then(() => {
    if (failures) {
      console.error(`canvas:check — ${failures} of ${checks} checks FAILED`);
      process.exit(1);
    }
    console.log(`canvas:check — OK (${checks} checks: planner, ordering, fingerprint, HTML, composers, cartridge, ${SEAMS.length} lock seams)`);
  })
  .catch((error) => {
    console.error("canvas:check — crashed", error);
    process.exit(1);
  });
