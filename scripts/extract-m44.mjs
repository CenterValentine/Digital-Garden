/**
 * One-off extraction: slice the self-contained m44-connected.html design
 * prototype into the three verbatim assets the React shell loads.
 *
 *   components/home/m44-home.css ← home-mock.css + main <style> + edit overrides
 *                                  (imported by the Shell so Next ships it
 *                                   render-blocking at first paint, route-scoped)
 *   public/garden/m44-home.js    ← all inline glue <script> blocks, concatenated
 *   components/home/m44-markup.ts ← the .stage scaffold + overlay sections as a
 *                                   string (rendered via dangerouslySetInnerHTML)
 *
 * Asset paths are rewritten from prototype-relative (logo-*.png) to /images/*.
 * Run from the worktree root: `node scripts/extract-m44.mjs`.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SRC = "/Users/davidvalentine/Downloads/design_handoff_personal_home 3";
const html = readFileSync(`${SRC}/m44-connected.html`, "utf8");
const homeMock = readFileSync(`${SRC}/home-mock.css`, "utf8");

function between(s, startMarker, endMarker, from = 0) {
  const a = s.indexOf(startMarker, from);
  if (a === -1) throw new Error(`start not found: ${startMarker}`);
  const b = s.indexOf(endMarker, a + startMarker.length);
  if (b === -1) throw new Error(`end not found: ${endMarker}`);
  return { text: s.slice(a + startMarker.length, b), endIndex: b + endMarker.length };
}

// ── CSS: main style block + edit-override block, after the shared home-mock kit
const mainStyle = between(html, "<style>\n", "</style>").text;
const overrideStyle = between(html, '<style id="__om-edit-overrides">', "</style>").text;
const css =
  `/* AUTO-EXTRACTED from design_handoff_personal_home/m44-connected.html.\n` +
  `   Served via <link> from PersonalHomeShell so it is scoped to the home\n` +
  `   route only. Do not hand-edit — re-run scripts/extract-m44.mjs. */\n\n` +
  `/* ── home-mock.css (shared identity kit) ── */\n${homeMock}\n` +
  `/* ── m44-connected.html main <style> ── */\n${mainStyle}\n` +
  `/* ── m44-connected.html edit overrides ── */\n${overrideStyle}\n` +
  `/* ── overlay sections stay hidden until the (unshipped) leaf/DNA engines\n` +
  `      load and flip inline visibility; keeps them from flashing as raw text ── */\n` +
  `#leafView,#dnaView,#resumeView{visibility:hidden}\n`;
writeFileSync("components/home/m44-home.css", css);

// ── Body scaffold: <body> … up to the first engine <script src>
const bodyRaw = between(html, "<body>\n", '\n  <script src="garden-plants.js">').text;
// rewrite prototype-relative logo paths → /images/, and add the About text link
let body = bodyRaw.replace(/src="logo-/g, 'src="/images/logo-');
// README: topbar gains a direct text link to /about (sibling of the leaf nav)
body = body.replace(
  '<a class="signin" href="#signin"',
  '<a class="about-lnk" href="/about">About</a>\n      <a class="signin" href="#signin"',
);
const markup =
  `/* AUTO-EXTRACTED scaffold from m44-connected.html — rendered via\n` +
  ` * dangerouslySetInnerHTML in PersonalHomeShell. The vanilla garden engines\n` +
  ` * (garden-plants/carousel + m44-home.js) own this DOM after mount; React only\n` +
  ` * diffs the __html prop, so it never fights the nodes they append.\n` +
  ` * Do not hand-edit — re-run scripts/extract-m44.mjs. */\n` +
  `export const M44_MARKUP = ${JSON.stringify(body)};\n`;
writeFileSync("components/home/m44-markup.ts", markup);

// ── Glue JS: every inline <script> (no src=) between the carousel include and
//    the leaf-engine includes (which we don't ship). Concatenate at top level so
//    the blocks keep the shared script scope they had in the document.
const glueRegion = between(
  html,
  '<script src="garden-carousel.js"></script>',
  '<script src="../../garden-leaf-shapes.js">',
).text;
const inlineBlocks = [...glueRegion.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
  (m) => m[1],
);
let jsBody = inlineBlocks.join("\n\n/* ── next block ── */\n\n");
// Rewrite prototype-relative HTML filenames to real app routes.
// The design package used standalone HTML files; the real site uses Next.js routes.
jsBody = jsBody.replace(/window\.location\.href='about-c\.html'/g, "window.location.href='/about'");
jsBody = jsBody.replace(/window\.location\.href='work-results\.html'/g, "window.location.href='/results'");
const js =
  `/* AUTO-EXTRACTED inline glue from m44-connected.html (carousel build, intro\n` +
  ` * sunrise, sun/moon arc, scroll-driven theme, showers, monarch critter).\n` +
  ` * Self-initializing IIFEs — load AFTER garden-plants.js + garden-carousel.js\n` +
  ` * and after window.CATS is set. Do not hand-edit — re-run extract-m44.mjs. */\n\n` +
  jsBody;
writeFileSync("public/garden/m44-home.js", js);

// ── Report external deps so the loader can guard the missing leaf engines
const deps = [...js.matchAll(/\b(M44LeafConnect|GardenLeaf|GardenDNA)\b/g)].reduce(
  (acc, m) => ((acc[m[1]] = (acc[m[1]] || 0) + 1), acc),
  {},
);
console.log("glue blocks:", inlineBlocks.length);
console.log("css bytes:", css.length, "| js bytes:", js.length, "| markup bytes:", body.length);
console.log("external deps referenced in glue:", JSON.stringify(deps));
