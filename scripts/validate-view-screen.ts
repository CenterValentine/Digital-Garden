/**
 * view_screen gate — AI-VIEW-SCREEN-PLAN.md.
 *
 * Run with: pnpm view-screen:check
 *
 * Gates (all reported in one run):
 *   1. Mode — only adapters verified to carry images inside a tool result
 *      (anthropic, openai/Responses) are "native"; every other adapter,
 *      including the gateway and openai-compat, gets the user-part path.
 *   2. Native — a view_screen result becomes text + image-url content.
 *   3. User-part — the result becomes text, followed by ONE labelled user
 *      message holding every image of that tool message.
 *   4. Untouched — folded stubs, failed captures, non-http URLs and every
 *      other tool's messages pass through by reference (the prompt cache).
 *   5. Pure + idempotent — no input mutation; a second pass changes nothing.
 *   6. Wiring — the route runs the post-pass on convertToModelMessages'
 *      output keyed on the ADAPTER, registers the tool only for a vision
 *      model on a capturing surface; the extension answers with the request
 *      id and refuses the app tab; screenshots create no tree node.
 *
 * Fixtures go through the real convertToModelMessages, so the gate sees the
 * shape the route sees. No Prisma, no env, no network.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";

import { deliverScreenCaptures, screenDeliveryMode, screenUserPartLabel } from "../lib/domain/ai/screen-delivery";
import { screenSummary, VIEW_SCREEN } from "../lib/domain/ai/tools/view-screen";
import { VIEW_IMAGE } from "../lib/domain/ai/tools/view-image";
import { describeImageMention } from "../lib/domain/ai/tools/read-image-text";
import { describeNoteImages } from "../lib/domain/content/note-images";
import { mentionsToPlainText } from "../lib/domain/ai/mention-markup";

const errors: string[] = [];
function check(label: string, cond: unknown): void {
  if (!cond) errors.push(label);
}
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const IMG = "https://r2.example/ai-screenshots/u1/shot.jpg";
const shotOutput = { ok: true, via: "active-tab", url: "https://example.com/a", title: "A page", imageUrl: IMG, mediaType: "image/jpeg", width: 1280, height: 800 };

let n = 0;
const toolPart = (name: string, output: unknown, id = `call-${++n}`) => ({
  type: `tool-${name}`,
  toolCallId: id,
  state: "output-available",
  input: {},
  output,
});
const user = (text = "look"): UIMessage => ({ id: `u${++n}`, role: "user", parts: [{ type: "text", text }] }) as UIMessage;
const assistant = (parts: unknown[]): UIMessage =>
  ({ id: `a${++n}`, role: "assistant", parts: [{ type: "step-start" }, ...parts] }) as unknown as UIMessage;

type ToolMsg = Extract<ModelMessage, { role: "tool" }>;
const toolMessages = (ms: ModelMessage[]) => ms.filter((m): m is ToolMsg => m.role === "tool");
const resultOf = (m: ToolMsg, name: string) => m.content.find((p) => p.type === "tool-result" && p.toolName === name) as
  | { output: { type: string; value: unknown } }
  | undefined;

async function main() {
  // ── 1. Mode ──────────────────────────────────────────────────────────────
  check("mode: anthropic is native", screenDeliveryMode("anthropic") === "native");
  check("mode: openai (Responses) is native", screenDeliveryMode("openai") === "native");
  for (const adapter of ["openai-compat", "vercel-gateway", "google", "xai", "mistral", "groq", "deepseek"]) {
    check(`mode: ${adapter} is user-part (unverified or stringifies tool-result images)`, screenDeliveryMode(adapter) === "user-part");
  }
  check("mode: no connection (legacy path) is user-part", screenDeliveryMode(undefined) === "user-part" && screenDeliveryMode(null) === "user-part");

  // ── Fixture: a screenshot next to an ordinary tool, then the reply ───────
  const ui: UIMessage[] = [
    user(),
    assistant([toolPart(VIEW_SCREEN, shotOutput, "shot-1"), toolPart("read_current_page", { untrustedWebContent: "text" }, "read-1")]),
  ];
  const base = await convertToModelMessages(ui);
  const baseJson = JSON.stringify(base);
  const baseTool = toolMessages(base)[0];
  check("fixture: convertToModelMessages yields a json output for view_screen", resultOf(baseTool, VIEW_SCREEN)?.output.type === "json");

  // ── 2. Native ────────────────────────────────────────────────────────────
  const native = deliverScreenCaptures(base, "native");
  const nativeOut = resultOf(toolMessages(native)[0], VIEW_SCREEN)?.output as { type: string; value: Array<{ type: string; text?: string; url?: string }> };
  check("native: output becomes content", nativeOut?.type === "content");
  check("native: text first, then the image-url", nativeOut?.value?.[0]?.type === "text" && nativeOut?.value?.[1]?.type === "image-url" && nativeOut.value[1].url === IMG);
  check("native: the text is the summary", nativeOut?.value?.[0]?.text === screenSummary(shotOutput as never));
  check("native: no message inserted", native.length === base.length);

  // ── 3. User-part ─────────────────────────────────────────────────────────
  const userPart = deliverScreenCaptures(base, "user-part");
  const toolIdx = userPart.findIndex((m) => m.role === "tool");
  const upOut = resultOf(userPart[toolIdx] as ToolMsg, VIEW_SCREEN)?.output;
  check("user-part: the tool result becomes the text summary", upOut?.type === "text" && upOut.value === screenSummary(shotOutput as never));
  const inserted = userPart[toolIdx + 1];
  check("user-part: exactly one message inserted", userPart.length === base.length + 1);
  check("user-part: the inserted message follows the tool message and is a user message", inserted?.role === "user");
  const insertedContent = (inserted?.content ?? []) as Array<{ type: string; text?: string; image?: unknown; mediaType?: string }>;
  check("user-part: labelled as tool output, naming the call", insertedContent[0]?.text === screenUserPartLabel([{ toolName: VIEW_SCREEN, toolCallId: "shot-1" }]) && /not a message from the user/.test(insertedContent[0]?.text ?? ""));
  check("user-part: carries the image as a URL with its media type", insertedContent[1]?.type === "image" && String(insertedContent[1]?.image) === IMG && insertedContent[1]?.mediaType === "image/jpeg");

  // Two screenshots in one step → one user message with both.
  const two = await convertToModelMessages([user(), assistant([toolPart(VIEW_SCREEN, shotOutput, "s1"), toolPart(VIEW_SCREEN, { ...shotOutput, imageUrl: `${IMG}?2` }, "s2")])]);
  const twoOut = deliverScreenCaptures(two, "user-part");
  const twoUsers = twoOut.filter((m) => m.role === "user");
  check("user-part: two screenshots in one step share one inserted message", twoOut.length === two.length + 1 && (twoUsers[twoUsers.length - 1].content as unknown[]).length === 3);

  // ── 4. Untouched ─────────────────────────────────────────────────────────
  for (const mode of ["native", "user-part"] as const) {
    const out = deliverScreenCaptures(base, mode);
    const otherBefore = resultOf(baseTool, "read_current_page");
    const otherAfter = resultOf(toolMessages(out)[0], "read_current_page");
    check(`${mode}: another tool's result in the same message is byte-identical`, JSON.stringify(otherBefore) === JSON.stringify(otherAfter));
    check(`${mode}: messages before the tool message are the same objects`, out[0] === base[0] && out[1] === base[1]);
  }
  const folded = await convertToModelMessages([
    user(),
    assistant([toolPart(VIEW_SCREEN, "[folded — this view_screen result from an earlier turn was digested into the reply that followed]")]),
  ]);
  const failed = await convertToModelMessages([user(), assistant([toolPart(VIEW_SCREEN, { ok: false, error: "the extension did not answer" })])]);
  const nonHttp = await convertToModelMessages([user(), assistant([toolPart(VIEW_SCREEN, { ...shotOutput, imageUrl: "data:image/jpeg;base64,AAAA" })])]);
  const plain = await convertToModelMessages([user(), assistant([toolPart("read_content", "Title: x")])]);
  for (const [label, ms] of [["a folded stub", folded], ["a failed capture", failed], ["a non-http image URL", nonHttp], ["a transcript without view_screen", plain]] as const) {
    for (const mode of ["native", "user-part"] as const) {
      check(`${mode}: ${label} passes through by reference`, deliverScreenCaptures(ms, mode) === ms);
    }
  }

  // ── 5. Pure + idempotent ─────────────────────────────────────────────────
  check("pure: the input is not mutated", JSON.stringify(base) === baseJson);
  for (const mode of ["native", "user-part"] as const) {
    const once = deliverScreenCaptures(base, mode);
    check(`${mode}: a second pass changes nothing`, deliverScreenCaptures(once, mode) === once);
  }
  check("summary: never carries the image URL (the model gets the picture, not a link)", !screenSummary(shotOutput as never).includes(IMG));

  // ── 6. Wiring ────────────────────────────────────────────────────────────
  const route = read("app/api/ai/chat/route.ts");
  check(
    "route: the post-pass wraps convertToModelMessages, keyed on the connection's ADAPTER",
    /deliverScreenCaptures\(\s*await convertToModelMessages\(/.test(route) && route.includes("screenDeliveryMode(activeConnection?.adapterKind)"),
  );
  check(
    "route: view_screen registers only for a vision model on a capturing surface",
    /\(coBrowseAvailable \|\| appCaptureAvailable\) && visionCapable[\s\S]{0,80}\[VIEW_SCREEN\]: viewScreenTool/.test(route),
  );
  check(
    "route: vision reads the connection's own model row, not only the bare id",
    /effectiveCapabilities\(\s*activeConnection\?\.models\.find\(\(m\) => m\.id === activeModelId\) \?\? \{ id: activeModelId \},?\s*\)\.has\("vision"\)/.test(route),
  );
  const panel = read("extensions/browser-bookmarks/browser-extension/src/panel/index.js");
  const handler = panel.slice(panel.indexOf('data.type === "capture-visible-tab"'));
  check("extension: handles capture-visible-tab", panel.includes('data.type === "capture-visible-tab"'));
  check("extension: refuses the app's own tab before capturing", /if \(origin && origin === appOrigin\) \{[\s\S]{0,200}code: "app-tab"/.test(handler) && handler.indexOf('"app-tab"') < handler.indexOf("captureVisibleTab("));
  check("extension: every reply carries the request id", (handler.slice(0, handler.indexOf("// Associated content")).match(/postToEmbed\("visible-tab-capture(-error)?", \{\s*id/g) ?? []).length >= 4);
  check("extension: never replies on the composer's `screenshot` message", !/postToEmbed\("screenshot"/.test(handler.slice(0, handler.indexOf("// Associated content"))));
  const bridge = read("lib/domain/browser-extension/panel-bridge.ts");
  const capture = bridge.slice(bridge.indexOf("export function captureVisibleTabImage"), bridge.indexOf("/** Decode a data: URL"));
  check("bridge: matches replies on the request id", capture.includes("if (p.id !== id) return;") && capture.includes('type: "capture-visible-tab", payload: { id }'));
  const upload = read("app/api/ai/attachments/upload/route.ts");
  check("upload: a screenshot gets its own prefix and no referenced node", upload.includes('isScreenshot ? "ai-screenshots" : "chat-attachments"') && /isScreenshot\s*\?\s*null\s*:\s*await createReferencedFileNode/.test(upload));
  const engine = read("lib/domain/ai/use-conversation-engine.ts");
  check("engine: view_screen resumes the loop like the other client tools", /part\.type === `tool-\$\{VIEW_SCREEN\}`/.test(engine));
  check("engine: both request builders send appCaptureAvailable", (engine.match(/appCaptureAvailable: isAppCaptureSupported\(\)/g) ?? []).length === 2);

  // ── 7. Areas, never wider than asked (D12) and images (D13) ──────────────
  const contract = read("lib/domain/ai/tools/view-screen.ts");
  const appCapture = read("lib/features/screen-capture/capture-app.ts");
  const executor = read("lib/features/screen-capture/index.ts");
  check(
    "areas: pane, all-panes, left-sidebar, right-sidebar, window",
    contract.includes('VIEW_SCREEN_AREAS = ["pane", "all-panes", "left-sidebar", "right-sidebar", "window"] as const'),
  );
  check("areas: the default is the narrowest (the focused pane)", executor.includes('captureApp(input.area ?? "pane", input.contentId)'));
  for (const [area, file] of [
    ["panes", "components/content/MainPanelWorkspace.tsx"],
    ["left-sidebar", "components/content/LeftSidebar.tsx"],
    ["right-sidebar", "components/content/RightSidebar.tsx"],
  ] as const) {
    check(`areas: ${file} carries data-capture-region="${area}"`, read(file).includes(`data-capture-region="${area}"`));
    check(`areas: the capture looks the ${area} region up by that marker`, appCapture.includes(`'[data-capture-region="${area}"]'`));
  }
  check(
    "never wider: a missing region is refused, never swapped for the window",
    /if \(!target\) \{[\s\S]{0,200}throw new AppCaptureRefused/.test(appCapture) && !/\?\?\s*document\.body/.test(appCapture),
  );
  check("never wider: a collapsed region (zero size) counts as missing", /rect\.width > 1 && rect\.height > 1 \? el : null/.test(appCapture));
  check("never wider: a refusal reaches the model as a result, not a thrown error", /err instanceof AppCaptureRefused\) return \{ ok: false/.test(executor));
  check(
    "images: a cross-origin image with a content id loads through the same-origin download route",
    appCapture.includes("fetchFn: imageFetcher(target, unreadable)") &&
      appCapture.includes('img[data-content-id]') &&
      appCapture.includes("/download?stream=true"),
  );
  check("images: an unreadable image is reported to the model", /could not be loaded into the screenshot/.test(appCapture));
  check(
    "images: the image viewer tags its <img> with the content id",
    read("components/content/viewer/ImageViewer.tsx").includes("data-content-id={contentId}") &&
      read("components/content/viewer/FileViewer.tsx").includes("contentId={contentId}"),
  );
  check(
    "summary: names the area captured",
    screenSummary({ ok: true, via: "app", area: "left-sidebar" }).includes("file tree") &&
      screenSummary({ ok: true, via: "app", area: "all-panes" }).includes("every open"),
  );

  // ── 8. view_image: the image file itself, to a vision model (D14) ────────
  const fileResult = { ok: true, via: "file", contentId: "11111111-1111-4111-8111-111111111111", title: "bookcove", imageUrl: IMG, mediaType: "image/png" };
  const viewed = await convertToModelMessages([user(), assistant([toolPart(VIEW_IMAGE, fileResult, "img-1")])]);
  const viewedNative = resultOf(toolMessages(deliverScreenCaptures(viewed, "native"))[0], VIEW_IMAGE)?.output as { type: string; value: Array<{ type: string; url?: string }> };
  check("view_image native: the file's image rides the tool result", viewedNative?.type === "content" && viewedNative.value[1]?.url === IMG);
  const viewedUser = deliverScreenCaptures(viewed, "user-part");
  const viewedLabel = (viewedUser[viewedUser.length - 1].content as Array<{ text?: string }>)[0]?.text ?? "";
  check("view_image user-part: one labelled image message naming view_image", viewedUser.length === viewed.length + 1 && viewedLabel.includes(`${VIEW_IMAGE} call img-1`));
  check("view_image summary: names the file and id, never the URL", screenSummary(fileResult as never).includes('"bookcove"') && !screenSummary(fileResult as never).includes(IMG));
  check(
    "route: delivery also runs in prepareStep (a server-run view_image is seen in the same request)",
    /prepareStep: \(\{ stepNumber, messages: undeliveredStepMessages \}\) => \{[\s\S]{0,400}deliverScreenCaptures\(undeliveredStepMessages, screenMode\)/.test(route),
  );
  check("route: view_image is registered for every vision model", /\.\.\.\(visionCapable \? \{ \[VIEW_IMAGE\]: createViewImageTool\(toolCtx\) \} : \{\}\)/.test(route));
  check("route: read_content and mentions learn whether view_image is on", route.includes("toolCtx.imageViewable = VIEW_IMAGE in tools;"));
  // D15: "look at my screen" names nothing a hint could activate — so the tool is advertised wherever registered.
  check("route: view_screen is advertised wherever it is registered", route.includes("if (VIEW_SCREEN in tools) advertised.add(VIEW_SCREEN);"));
  check(
    "route: …after the mode narrowing that would otherwise drop it",
    route.indexOf("if (VIEW_SCREEN in tools) advertised.add(VIEW_SCREEN);") > route.indexOf("if (!offered.has(id)) advertised.delete(id);"),
  );
  check("view_image tells the model a screen request is view_screen's", read("lib/domain/ai/tools/view-image.ts").includes("Not for the user's screen: that is view_screen."));
  // A result that names a tool turns it on — the loop fix.
  check("route: the named tools are view_image and read_image_text", route.includes("const RESULT_NAMED_TOOLS = [VIEW_IMAGE, READ_IMAGE_TEXT];"));
  check("route: every server tool result is scanned for named tools", /const output = await original\(input, options\);\s*activateNamedTools\(output, name\);/.test(route));
  check("route: mentions are scanned before the first step", route.includes('activateNamedTools(mentionedContext, "mention");'));
  check("route: this turn's earlier results are rescanned on a new request", route.includes('activateNamedTools(output, "turn-history")'));
  check("route: an activation needs the tool registered and not yet advertised", /if \(id in tools && !isAdvertised\(id\) && text\.includes\(id\)\)/.test(route));
  // Hints point at SEEING when the model can see.
  const id = "11111111-1111-4111-8111-111111111111";
  check("mention: a vision model is told to call view_image", describeImageMention(id, "image/png", true, true).includes(`view_image with contentId ${id}`));
  check("mention: without vision it still points at read_image_text", describeImageMention(id, "image/png", true, false).includes("read_image_text"));
  const noteImgs = [{ name: "cover.png", contentId: id, url: IMG }] as Parameters<typeof describeNoteImages>[0];
  check("note images: a vision model is pointed at view_image", describeNoteImages(noteImgs, true, true)?.includes("view_image") === true);
  check("note images: without vision, read_image_text", describeNoteImages(noteImgs, true, false)?.includes("read_image_text") === true);
  const registry = read("lib/domain/ai/tools/registry.ts");
  check(
    "read_content: an image file points a vision model at view_image",
    /isImage && ctx\.imageViewable === true\s*\?\s*"\\n\\nThis is an image\. To see what it shows, call view_image with this content id\."/.test(registry),
  );
  const viewImage = registry.slice(registry.indexOf("export function createViewImageTool"), registry.indexOf("export function createViewImageTool") + 3000);
  check("view_image: only the user's own, undeleted file", viewImage.includes("where: { id: contentId, ownerId: ctx.userId, deletedAt: null }"));
  check("view_image: refuses types and sizes a vision model cannot take", viewImage.includes("VIEW_IMAGE_MEDIA_TYPES.has(file.mimeType)") && viewImage.includes("> VIEW_IMAGE_MAX_BYTES"));

  // ── 9. D16: scroll, "this file", and titles without mention markup ──────
  check("scroll: the capture restores scroll positions (off by default in the library)", appCapture.includes("features: { restoreScrollPosition: true }"));
  check(
    "contentId: the schema takes it, the executor passes it, the capture finds the pane showing it",
    contract.includes("contentId: z") && executor.includes('captureApp(input.area ?? "pane", input.contentId)') && /if \(contentId\) \{\s*const paneId = paneShowing\(contentId\);/.test(appCapture),
  );
  check("contentId: an item not open in a visible pane is refused, never widened", /contentId\s*\?\s*"that item is not open in a visible pane, so nothing was captured/.test(appCapture));
  check("chat pane: capturing the chat itself tells the model how to reach the other pane", /tab\?\.contentType === "chat"[\s\S]{0,300}This pane is the chat itself/.test(appCapture));
  check("title: from the store, mention markup rendered", appCapture.includes("mentionsToPlainText(tab.title)") && !appCapture.includes("[data-active-tab]"));
  check("mentions: @[Title](id) renders as @Title", mentionsToPlainText("look at @[bookcove](ec196794-1472-41da-929c-4a27a24f6e8b) now") === "look at @bookcove now");
  check("mentions: text without markup is untouched", mentionsToPlainText("a [link](x) and @someone") === "a [link](x) and @someone");
  check("titles: the auto-title route renders mentions before titling", read("app/api/conversations/[id]/auto-title/route.ts").includes(".map((p) => mentionsToPlainText(p.text))"));
  for (const file of ["components/content/ai/ChatInput.tsx", "lib/domain/ai/use-conversation-engine.ts", "components/content/ai/ChatMessage.tsx"]) {
    check(`mentions: ${file} uses the one shared regex`, read(file).includes('from "@/lib/domain/ai/mention-markup"') && !read(file).includes("/@\\[([^\\]]+)\\]\\(([^)]+)\\)/g"));
  }

  if (errors.length > 0) {
    console.error(`\n✖ view-screen:check failed — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("✓ view-screen:check — delivery mode, native + user-part rewrites, pass-through, purity, wiring");
}

void main();
