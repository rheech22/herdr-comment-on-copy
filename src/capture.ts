import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { buildContext, originOf } from "./context.ts";
import { Herdr } from "./herdr.ts";
import { ensureState, paths, remove } from "./paths.ts";
import type { Source } from "./types.ts";

function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export function clearStaleLock() {
  if (!existsSync(paths.lock)) return;
  try {
    const value = readFileSync(paths.lock, "utf8").trim();
    if (/^\d+$/.test(value) && alive(Number(value))) return;
    if (value.startsWith("pending:") && Date.now() - statSync(paths.lock).mtimeMs < 30000) return;
  } catch { /* Remove an abandoned lock. */ }
  remove(paths.lock);
}
export async function openNote(api: Herdr, text: string, source?: Source | null, focusedPane?: string | null,
  view: "comment" | "collection" = "comment") {
  ensureState();
  clearStaleLock();
  const owner = `pending:${process.pid}:${randomUUID()}`;
  try { writeFileSync(paths.lock, owner, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    const captured_at = new Date().toISOString();
    const focused = focusedPane ?? await api.focused();
    const located = source === undefined ? await api.locate(text) : source;
    const paneId = located?.pane_id || focused;
    const [agents, origin, context] = await Promise.all([
      api.agents(), originOf(api, paneId), view === "collection" ? [] : buildContext(api, paneId, text, located),
    ]);
    writeFileSync(paths.payload, JSON.stringify({ text, view, captured_at, source: located, focused_pane_id: focused, agents, origin, context }), { mode: 0o600 });
    // Herdr popups always open over the active pane and reject an explicit target.
    await api.result("plugin.pane.open", { plugin_id: "comment_on_copy", entrypoint: "note", focus: true });
    return true;
  } catch (error) {
    try { if (readFileSync(paths.lock, "utf8").trim() === owner) remove(paths.lock); } catch { /* Already closed. */ }
    throw error;
  }
}
