/**
 * Interactive worktree picker for `pnpm wt` / bare `pnpm dev -wt`: the same
 * table, where clicking a row (or ↑↓ + Enter) picks that worktree.
 *
 * Hand-rolled rather than a prompt library because the point is MOUSE input:
 * inquirer / prompts / clack are keyboard-only. Terminals that support xterm
 * mouse reporting (VS Code's terminal, iTerm2, Terminal.app) send clicks as
 * SGR escape sequences once asked to (`?1000h` + `?1006h`), which is all this
 * needs. Runs on the alternate screen so the table vanishes once you choose.
 */
import type { WorktreeTable } from "./worktrees";

const ESC = "\x1b[";
const ENTER_UI = `${ESC}?1049h${ESC}?25l${ESC}?1000h${ESC}?1003h${ESC}?1006h`; // alt screen, hide cursor, clicks + motion, SGR coords
const LEAVE_UI = `${ESC}?1006l${ESC}?1003l${ESC}?1000l${ESC}?25h${ESC}?1049l`;
const FIRST_ROW = 3; // 1-based screen line of the first worktree row: title, header, rows (see draw)

/** Resolves to the picked worktree's name, or null if dismissed (q / Esc / Ctrl+C). */
export function pickWorktree(table: WorktreeTable): Promise<string | null> {
  const { stdin, stdout } = process;
  let selected = 0;
  let top = 0; // first visible row when the table is taller than the terminal

  // Every line below the header goes to rows, minus the footer notes — short
  // terminal panels (VS Code's default) shouldn't leave a 3-row list.
  const visibleCount = () => Math.max(1, (stdout.rows || 24) - (FIRST_ROW - 1) - table.notes.length);

  const draw = () => {
    const n = visibleCount();
    if (selected < top) top = selected;
    if (selected >= top + n) top = selected - n + 1;
    const total = table.rows.length;
    const range = total > n ? `   \x1b[2mrows ${top + 1}–${Math.min(top + n, total)} of ${total} · wheel to scroll\x1b[0m` : "";
    const out = [
      `${ESC}H${ESC}2J  \x1b[1mWorktrees\x1b[0m — click one to serve it   \x1b[2m↑↓ Enter · q to quit\x1b[0m${range}`,
      `\x1b[2m${table.header}\x1b[0m`,
    ];
    table.rows.slice(top, top + n).forEach((row, i) => {
      out.push(top + i === selected ? `\x1b[7m${row}\x1b[0m` : row);
    });
    out.push(...table.notes);
    stdout.write(out.join("\r\n"));
  };

  return new Promise((resolve) => {
    // If the process dies mid-pick, never leave the terminal in mouse-reporting mode.
    const restore = () => stdout.write(LEAVE_UI);
    const finish = (name: string | null) => {
      process.off("exit", restore);
      stdin.off("data", onData);
      stdout.off("resize", draw);
      restore();
      stdin.setRawMode(false);
      stdin.pause();
      resolve(name);
    };

    const rowAt = (y: number): number | null => {
      const i = top + (y - FIRST_ROW);
      return y >= FIRST_ROW && i < table.rows.length && i - top < visibleCount() ? i : null;
    };

    const move = (delta: number) => {
      selected = Math.min(table.rows.length - 1, Math.max(0, selected + delta));
      draw();
    };

    // One chunk can hold several keys/mouse events (fast typing, key repeat,
    // motion bursts), so consume it token by token. Returns true once finished.
    const TOKEN = /\x1b\[<(\d+);(\d+);(\d+)([Mm])|\x1b\[A|\x1b\[B|\x1b|\r|\n|\x03|./g; // \r \n matched explicitly, so "." needs no s flag
    const onData = (buf: Buffer) => {
      for (const m of buf.toString("utf8").matchAll(TOKEN)) {
        const tok = m[0];
        if (m[1] !== undefined) {
          // SGR mouse: ESC [ < button ; x ; y (M = press/motion, m = release)
          const [button, y, kind] = [Number(m[1]), Number(m[3]), m[4]];
          const row = rowAt(y);
          if (button === 64) move(-1); // wheel up
          else if (button === 65) move(1); // wheel down
          else if (row !== null && button & 32) {
            if (row !== selected) {
              selected = row; // hover
              draw();
            }
          } else if (row !== null && button === 0 && kind === "M") {
            return finish(table.names[row]); // left click
          }
        } else if (tok === "\x1b[A" || tok === "k") move(-1);
        else if (tok === "\x1b[B" || tok === "j") move(1);
        else if (tok === "\r" || tok === "\n") return finish(table.names[selected]);
        else if (tok === "q" || tok === "\x1b" || tok === "\x03") return finish(null);
      }
    };

    process.once("exit", restore);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    stdout.on("resize", draw);
    stdout.write(ENTER_UI);
    draw();
  });
}
