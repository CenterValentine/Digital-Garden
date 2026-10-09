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
  check("user-part: labelled as tool output, naming the call", insertedContent[0]?.text === screenUserPartLabel(["shot-1"]) && /not a message from the user/.test(insertedContent[0]?.text ?? ""));
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

  if (errors.length > 0) {
    console.error(`\n✖ view-screen:check failed — ${errors.length} problem(s):\n`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log("✓ view-screen:check — delivery mode, native + user-part rewrites, pass-through, purity, wiring");
}

void main();
