import { appendFileSync, statSync, writeFileSync } from "node:fs";
import { paths } from "./paths.ts";

/** Bounded diagnostics contain decisions and counts, never clipboard contents. */
export function traceCapture(reason: string, chars: number, lines: number, elapsed_ms = 0, pane_id?: string) {
  try {
    try { if (statSync(paths.captureLog).size >= 256 * 1024) writeFileSync(paths.captureLog, "", { mode: 0o600 }); } catch {}
    appendFileSync(paths.captureLog, JSON.stringify({ at: new Date().toISOString(), reason, chars, lines, elapsed_ms, pane_id }) + "\n", { mode: 0o600 });
  } catch { /* Diagnostics never prevent capture. */ }
}
