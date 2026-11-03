/**
 * A mock Canvas for trying the Canvas archive without a school's token
 * (CANVAS-ARCHIVE-PLAN.md). Dev only — `pnpm canvas:mock`.
 *
 *   1. Start it:            pnpm canvas:mock            (http://localhost:4580)
 *   2. Serve the app with:  CANVAS_ALLOW_LOCAL=1 pnpm dev
 *   3. + → Canvas Course… → address http://localhost:4580, any token but "bad".
 *
 * One past course (BIO 201) covers every item type: pages with links,
 * images, an equation image and an embedded video; a SubHeader; a PDF; an
 * assignment with your submission, grade and feedback; a discussion with
 * your reply among classmates'; a quiz with your score; external links.
 * Module lists are paginated (Link headers) like real Canvas.
 *
 *   POST /__mock/change   edits the course: two pages change, a module is
 *                         renamed, a page is added, one is removed — then
 *                         use the Canvas tab's "Check for changes".
 *   POST /__mock/reset    back to the original course.
 *   GET  /__mock/demo.imscc  the same course as a Common Cartridge export.
 */

import http from "node:http";
import JSZip from "jszip";

const PORT = Number(process.env.CANVAS_MOCK_PORT ?? 4580);
const ORIGIN = `http://localhost:${PORT}`;
const SELF_ID = 1001;
const COURSE = 42;

// 1×1 transparent PNG and a minimal PDF.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);

interface MockPage {
  url: string;
  title: string;
  body: string;
  updated_at: string;
}

interface MockItem {
  id: number;
  title: string;
  type: string;
  content_id?: number;
  page_url?: string;
  external_url?: string;
}

interface MockModule {
  id: number;
  name: string;
  position: number;
  items: MockItem[];
}

interface State {
  pages: Map<string, MockPage>;
  modules: MockModule[];
}

function initialState(): State {
  const t0 = "2023-09-01T12:00:00Z";
  const pages = new Map<string, MockPage>([
    [
      "lipid-bilayers",
      {
        url: "lipid-bilayers",
        title: "Lipid Bilayers",
        updated_at: t0,
        body: [
          `<p>Membranes are <strong>lipid bilayers</strong>. Next, read <a href="/courses/${COURSE}/pages/osmosis">about osmosis</a>.</p>`,
          `<p><img src="/courses/${COURSE}/files/8/preview" alt="Bilayer diagram"></p>`,
          `<p>Free energy: <img src="/equation_images/%5CDelta%20G" alt="ΔG"></p>`,
          `<iframe src="${ORIGIN}/media_objects/m-1" title="Lecture 1 video"></iframe>`,
          `<p>Your grades are <a href="/courses/${COURSE}/grades">here</a>.</p>`,
        ].join(""),
      },
    ],
    [
      "osmosis",
      {
        url: "osmosis",
        title: "Osmosis",
        updated_at: t0,
        body: `<h2>Osmosis</h2><p>Water moves toward higher solute concentration. Back to <a href="${ORIGIN}/courses/${COURSE}/pages/lipid-bilayers">bilayers</a>.</p>`,
      },
    ],
    [
      "receptors",
      { url: "receptors", title: "Receptors", updated_at: t0, body: "<p>Receptors bind ligands.</p>" },
    ],
    [
      "orphan-page",
      { url: "orphan-page", title: "Not in any module", updated_at: t0, body: "<p>Hidden from modules.</p>" },
    ],
  ]);
  const modules: MockModule[] = [
    {
      id: 1,
      name: "Membranes",
      position: 1,
      items: [
        { id: 101, title: "Lipid Bilayers", type: "Page", page_url: "lipid-bilayers" },
        { id: 102, title: "Week 1 materials", type: "SubHeader" },
        { id: 103, title: "Lecture 1 slides.pdf", type: "File", content_id: 7 },
        { id: 104, title: "Problem Set 1", type: "Assignment", content_id: 9 },
        { id: 105, title: "Introduce yourself", type: "Discussion", content_id: 11 },
      ],
    },
    {
      id: 2,
      name: "Transport",
      position: 2,
      items: [
        { id: 201, title: "Khan Academy: Diffusion", type: "ExternalUrl", external_url: "https://www.khanacademy.org/science/biology/membranes-and-transport" },
        { id: 202, title: "Quiz 1", type: "Quiz", content_id: 13 },
        { id: 203, title: "Osmosis", type: "Page", page_url: "osmosis" },
      ],
    },
    {
      id: 3,
      name: "Signaling",
      position: 3,
      items: [
        { id: 301, title: "Receptors", type: "Page", page_url: "receptors" },
        { id: 302, title: "Course reserves", type: "ExternalTool", external_url: `${ORIGIN}/courses/${COURSE}/external_tools/5` },
      ],
    },
  ];
  return { pages, modules };
}

let state = initialState();

function applyChange() {
  const t1 = "2023-12-15T09:30:00Z";
  const bilayers = state.pages.get("lipid-bilayers") as MockPage;
  bilayers.body = bilayers.body.replace("Membranes are", "Cell membranes are");
  bilayers.updated_at = t1;
  const osmosis = state.pages.get("osmosis") as MockPage;
  osmosis.body += "<p>Added after the term: aquaporins speed this up.</p>";
  osmosis.updated_at = t1;
  state.modules[0].name = "Membranes and Lipids";
  state.pages.set("active-transport", {
    url: "active-transport",
    title: "Active Transport",
    updated_at: t1,
    body: "<p>Pumps use ATP.</p>",
  });
  state.modules[1].items.push({ id: 204, title: "Active Transport", type: "Page", page_url: "active-transport" });
  state.modules[2].items = state.modules[2].items.filter((item) => item.id !== 301);
}

const files: Record<number, { name: string; type: string; body: Buffer; updated_at: string }> = {
  7: { name: "Lecture 1 slides.pdf", type: "application/pdf", body: PDF, updated_at: "2023-09-01T12:00:00Z" },
  8: { name: "bilayer.png", type: "image/png", body: PNG, updated_at: "2023-09-01T12:00:00Z" },
  21: { name: "answers.docx", type: "application/octet-stream", body: Buffer.from("PK fake docx"), updated_at: "2023-09-10T12:00:00Z" },
};

function fileMeta(id: number) {
  const file = files[id];
  return {
    id,
    display_name: file.name,
    filename: file.name,
    "content-type": file.type,
    size: file.body.length,
    updated_at: file.updated_at,
    url: `${ORIGIN}/files/${id}/download?verifier=v${id}`,
    locked_for_user: false,
  };
}

const assignment = {
  id: 9,
  name: "Problem Set 1",
  description: `<p>Answer questions 1–5. Use <a href="/courses/${COURSE}/pages/lipid-bilayers">the reading</a>.</p>`,
  due_at: "2023-09-15T23:59:00Z",
  points_possible: 10,
  updated_at: "2023-09-01T12:00:00Z",
};

const submission = {
  workflow_state: "graded",
  submitted_at: "2023-09-14T20:00:00Z",
  graded_at: "2023-09-18T10:00:00Z",
  late: false,
  body: "<p>My answers: 1) hydrophobic tails…</p>",
  url: null,
  score: 9,
  grade: "A-",
  attachments: [fileMeta(21)],
  submission_comments: [
    { author_name: "Dr. Rivera", created_at: "2023-09-18T10:00:00Z", comment: "Strong work. Revisit question 4." },
  ],
};

function json(res: http.ServerResponse, body: unknown, status = 200, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function paginate(res: http.ServerResponse, url: URL, all: unknown[]) {
  const perPage = Math.min(Number(url.searchParams.get("per_page") ?? 10), 2); // tiny pages exercise the Link header
  const page = Number(url.searchParams.get("page") ?? 1);
  const slice = all.slice((page - 1) * perPage, page * perPage);
  const headers: Record<string, string> = {};
  if (page * perPage < all.length) {
    const next = new URL(url.toString());
    next.searchParams.set("page", String(page + 1));
    headers.Link = `<${ORIGIN}${next.pathname}${next.search}>; rel="next"`;
  }
  json(res, slice, 200, headers);
}

async function demoCartridge(): Promise<Buffer> {
  const zip = new JSZip();
  const resources: string[] = [];
  const metaItems: string[] = [];
  let position = 1;
  for (const mod of initialState().modules) {
    const items = mod.items.map((item) => {
      const id = `it${item.id}`;
      let res = "";
      if (item.type === "Page") {
        res = `res_${item.page_url}`;
        const page = initialState().pages.get(item.page_url as string) as MockPage;
        const body = page.body
          .replace(new RegExp(`(${ORIGIN})?/courses/${COURSE}/pages/`, "g"), "$WIKI_REFERENCE$/pages/")
          .replace(new RegExp(`/courses/${COURSE}/files/8/preview`, "g"), "$IMS-CC-FILEBASE$/images/bilayer.png");
        zip.file(`wiki_content/${item.page_url}.html`, `<html><head><title>${page.title}</title></head><body>${body}</body></html>`);
        resources.push(`<resource identifier="${res}" type="webcontent" href="wiki_content/${item.page_url}.html"><file href="wiki_content/${item.page_url}.html"/></resource>`);
      } else if (item.type === "File") {
        res = "res_file7";
        zip.file("web_resources/slides/Lecture 1 slides.pdf", PDF);
        resources.push(`<resource identifier="${res}" type="webcontent" href="web_resources/slides/Lecture 1 slides.pdf"><file href="web_resources/slides/Lecture 1 slides.pdf"/></resource>`);
      } else if (item.type === "Assignment") {
        res = "res_asg9";
        zip.file(`${res}/problem-set-1.html`, `<html><body>${assignment.description.replace(/\/courses\/42\/pages\//g, "$WIKI_REFERENCE$/pages/")}</body></html>`);
        zip.file(`${res}/assignment_settings.xml`, `<?xml version="1.0"?><assignment identifier="${res}"><due_at>2023-09-15T23:59:00</due_at><points_possible>10.0</points_possible></assignment>`);
        resources.push(`<resource identifier="${res}" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="${res}/problem-set-1.html"><file href="${res}/problem-set-1.html"/><file href="${res}/assignment_settings.xml"/></resource>`);
      } else if (item.type === "Discussion") {
        res = "res_disc11";
        zip.file(`${res}.xml`, `<?xml version="1.0"?><topic><title>Introduce yourself</title><text texttype="text/html">&lt;p&gt;Tell us about yourself.&lt;/p&gt;</text></topic>`);
        resources.push(`<resource identifier="${res}" type="imsdt_xmlv1p1"><file href="${res}.xml"/></resource>`);
      }
      const typeMap: Record<string, string> = {
        Page: "WikiPage",
        File: "Attachment",
        Assignment: "Assignment",
        Discussion: "DiscussionTopic",
        Quiz: "Quizzes::Quiz",
        ExternalUrl: "ExternalUrl",
        ExternalTool: "ContextExternalTool",
        SubHeader: "ContextModuleSubHeader",
      };
      return `<item identifier="${id}"><content_type>${typeMap[item.type]}</content_type><title>${item.title}</title>${res ? `<identifierref>${res}</identifierref>` : ""}${item.external_url ? `<url>${item.external_url}</url>` : ""}<position>${position++}</position></item>`;
    });
    metaItems.push(`<module identifier="mod${mod.id}"><title>${mod.name}</title><position>${mod.position}</position><items>${items.join("")}</items></module>`);
  }
  zip.file("images/placeholder.txt", "");
  zip.file("web_resources/images/bilayer.png", PNG);
  zip.file("course_settings/course_settings.xml", `<?xml version="1.0"?><course identifier="gmock42"><title>Cell Biology</title><course_code>BIO 201</course_code></course>`);
  zip.file("course_settings/module_meta.xml", `<?xml version="1.0"?><modules>${metaItems.join("")}</modules>`);
  zip.file("course_settings/syllabus.html", `<html><body><p>Welcome to BIO 201 (from the export).</p></body></html>`);
  zip.file(
    "imsmanifest.xml",
    `<?xml version="1.0" encoding="UTF-8"?><manifest identifier="mock42"><metadata><lom><general><title><string>Cell Biology</string></title></general></lom></metadata><organizations/><resources>${resources.join("")}</resources></manifest>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", ORIGIN);
  const path = url.pathname;

  if (path === "/__mock/change" && req.method === "POST") {
    applyChange();
    return json(res, { changed: true });
  }
  if (path === "/__mock/reset" && req.method === "POST") {
    state = initialState();
    return json(res, { reset: true });
  }
  if (path === "/__mock/demo.imscc") {
    const body = await demoCartridge();
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="bio201-export.imscc"' });
    return res.end(body);
  }

  // File downloads use a verifier, not the token (like Canvas's signed URLs).
  let match = /^\/files\/(\d+)\/download$/.exec(path);
  if (match) {
    const file = files[Number(match[1])];
    if (!file || !url.searchParams.get("verifier")) return json(res, { errors: [{ message: "not found" }] }, 404);
    res.writeHead(200, { "Content-Type": file.type, "Content-Length": String(file.body.length) });
    return res.end(file.body);
  }
  if (path.startsWith("/equation_images/")) {
    if (!req.headers.authorization) return json(res, { status: "unauthenticated" }, 401);
    res.writeHead(200, { "Content-Type": "image/png" });
    return res.end(PNG);
  }

  const auth = req.headers.authorization ?? "";
  if (!auth.startsWith("Bearer ") || auth === "Bearer bad") {
    return json(res, { errors: [{ message: "Invalid access token." }] }, 401);
  }

  const c = `/api/v1/courses/${COURSE}`;
  if (path === "/api/v1/users/self") return json(res, { id: SELF_ID, name: "Mock Student", short_name: "Mock Student" });
  if (path === "/api/v1/courses") {
    const stateFilter = url.searchParams.get("enrollment_state");
    if (stateFilter === "completed") {
      return paginate(res, url, [
        { id: COURSE, name: "Cell Biology", course_code: "BIO 201", term: { name: "Fall 2023" } },
        { id: 50, access_restricted_by_date: true },
      ]);
    }
    return paginate(res, url, [{ id: 77, name: "Organic Chemistry", course_code: "CHEM 210", term: { name: "Spring 2024" } }]);
  }
  if (path === c) {
    return json(res, {
      id: COURSE,
      name: "Cell Biology",
      course_code: "BIO 201",
      term: { name: "Fall 2023" },
      teachers: [{ display_name: "Dr. Rivera" }],
      syllabus_body: `<p>Welcome to BIO 201. Start with <a href="/courses/${COURSE}/pages/lipid-bilayers">the first reading</a>.</p>`,
    });
  }
  if (path === `${c}/modules`) {
    return paginate(
      res,
      url,
      state.modules.map((mod) => ({ ...mod, items: mod.items.map((item) => ({ ...item, html_url: `${ORIGIN}/courses/${COURSE}/modules/items/${item.id}` })) }))
    );
  }
  if (path === `${c}/pages`) return paginate(res, url, [...state.pages.values()].map(({ url: slug, title, updated_at }) => ({ url: slug, title, updated_at })));
  match = new RegExp(`^${c}/pages/([^/]+)$`).exec(path);
  if (match) {
    const page = state.pages.get(decodeURIComponent(match[1]));
    return page ? json(res, page) : json(res, { errors: [{ message: "page not found" }] }, 404);
  }
  if (path === `${c}/files`) return paginate(res, url, Object.keys(files).map((id) => fileMeta(Number(id))));
  match = new RegExp(`^(?:${c})?/api/v1/files/(\\d+)$|^${c}/files/(\\d+)$`).exec(path);
  if (match) {
    const id = Number(match[1] ?? match[2]);
    return files[id] ? json(res, fileMeta(id)) : json(res, { errors: [{ message: "file not found" }] }, 404);
  }
  if (path === `${c}/assignments`) return paginate(res, url, [{ ...assignment, submission }]);
  if (path === `${c}/assignments/9`) return json(res, assignment);
  if (path === `${c}/assignments/9/submissions/self`) return json(res, submission);
  if (path === `${c}/discussion_topics`) return paginate(res, url, [{ id: 11, posted_at: "2023-09-02T12:00:00Z", last_reply_at: "2023-09-05T12:00:00Z" }]);
  if (path === `${c}/discussion_topics/11`) {
    return json(res, { id: 11, message: "<p>Tell us about yourself.</p>", posted_at: "2023-09-02T12:00:00Z", author: { display_name: "Dr. Rivera" } });
  }
  if (path === `${c}/discussion_topics/11/view`) {
    return json(res, {
      view: [
        { user_id: 2002, message: "<p>A classmate's post (must not be imported).</p>", created_at: "2023-09-03T12:00:00Z" },
        {
          user_id: SELF_ID,
          message: "<p>Hi, I'm studying biology.</p>",
          created_at: "2023-09-04T12:00:00Z",
          replies: [{ user_id: SELF_ID, message: "<p>Following up on my intro.</p>", created_at: "2023-09-05T12:00:00Z" }],
        },
      ],
    });
  }
  if (path === `${c}/quizzes`) return paginate(res, url, [{ id: 13, title: "Quiz 1", points_possible: 10 }]);
  if (path === `${c}/quizzes/13`) return json(res, { id: 13, description: "<p>Ten questions on membranes.</p>", due_at: "2023-09-20T23:59:00Z", points_possible: 10 });
  if (path === `${c}/quizzes/13/submissions`) return json(res, { quiz_submissions: [{ score: 8, kept_score: 8 }] });

  return json(res, { errors: [{ message: `mock has no ${path}` }] }, 404);
});

server.listen(PORT, () => {
  console.log(`Mock Canvas on ${ORIGIN} — connect with any token except "bad". POST /__mock/change to edit the course.`);
});
