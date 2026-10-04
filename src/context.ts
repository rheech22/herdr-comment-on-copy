import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import { homedir } from "node:os";
import type { Context, Origin, Pane, Source } from "./types.ts";
import { Herdr } from "./herdr.ts";
import { run } from "./system.ts";

const shorten = (path: string) => path === homedir() ? "~" : path.startsWith(homedir() + sep) ? "~" + path.slice(homedir().length) : path;
export function filesIn(text: string, cwd?: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/(?:[a-z]:[\\/])?[\p{L}\p{N}_./\\~@+-]+\.[\p{L}\p{N}_]+(?::\d+)?/giu)) {
    const token = match[0];
    const path = token.replace(/:\d+$/, "");
    const full = path.startsWith("~/") ? join(homedir(), path.slice(2)) : isAbsolute(path) ? path : join(cwd || "", path);
    if (existsSync(full)) found.add(token);
  }
  return [...found].slice(0, 5);
}
export async function findSource(text: string, cwd?: string): Promise<string | null> {
  if (!cwd || !existsSync(cwd) || !statSync(cwd).isDirectory()) return null;
  const lines = text.split("\n").map(line => line.trim());
  const needle = lines.reduce((a, b) => Array.from(a).length >= Array.from(b).length ? a : b, "");
  if (Array.from(needle).length < 30) return null;
  try {
    const hits = (await run(["rg", "--fixed-strings", "--line-number", "--max-count", "1", "--no-messages", "--", needle, cwd], 3000))
      .trim().split("\n").filter(Boolean);
    if (!hits.length || hits.length > 3) return null;
    const hit = /^(.*?):(\d+):/.exec(hits[0]!);
    if (!hit) return null;
    const path = hit[1]!;
    let line = hit[2]!;
    const head = lines.find(value => Array.from(value).length >= 12);
    if (head && head !== needle) {
      try {
        const first = await run(["rg", "--fixed-strings", "--line-number", "--max-count", "1", "--no-messages", "--", head, path]);
        const match = /^(\d+):/.exec(first);
        if (match) line = match[1]!;
      } catch { /* Keep the line from the longest match. */ }
    }
    return `${relative(cwd, path)}:${line}`;
  } catch { return null; }
}
export async function originOf(api: Herdr, paneId?: string | null): Promise<Origin | null> {
  if (!paneId) return null;
  try {
    const { pane } = await api.result<{ pane: Pane }>("pane.get", { pane_id: paneId });
    return { pane_id: paneId, tab_id: pane.tab_id, workspace_id: pane.workspace_id };
  } catch { return null; }
}
async function running(api: Herdr, paneId: string): Promise<string | null> {
  try {
    const result = await api.result<{ process_info: { foreground_processes?: { name?: string; argv0?: string }[] } }>(
      "pane.process_info", { pane_id: paneId });
    const names = (result.process_info.foreground_processes || []).map(proc =>
      (proc.name || proc.argv0 || "").split(/[\\/]/).at(-1)!.replace(/^-+/, "")).filter(Boolean);
    return [...new Set(names)].join(", ") || null;
  } catch { return null; }
}
export async function buildContext(api: Herdr, paneId: string | null, text: string, source: Source | null): Promise<Context> {
  let pane: Partial<Pane> = {};
  if (paneId) {
    try { pane = (await api.result<{ pane: Pane }>("pane.get", { pane_id: paneId })).pane; } catch { /* Only omit unavailable context. */ }
  }
  const [spaces, tabs, processName] = await Promise.all([
    api.labels("workspace.list", "workspaces", "workspace_id"), api.labels("tab.list", "tabs", "tab_id"),
    paneId ? running(api, paneId) : null,
  ]);
  const rows: Context = [
    ["source", "Herdr (terminal workspace manager for AI agents) / Comment on Copy"],
    ["capture", "Selected/copied terminal text and available Herdr pane metadata, captured when opening this comment."],
  ];
  if (pane.workspace_id) rows.push(["workspace", spaces.get(pane.workspace_id) || pane.workspace_id]);
  if (pane.tab_id) rows.push(["tab", tabs.get(pane.tab_id) || pane.tab_id]);
  if (paneId) rows.push(["pane", paneId]);
  if (processName) rows.push(["process", processName]);
  if (pane.agent) rows.push(["agent", pane.agent]);
  if (pane.terminal_title_stripped) rows.push(["title", pane.terminal_title_stripped]);
  const cwd = pane.foreground_cwd || pane.cwd;
  if (cwd) {
    rows.push(["cwd", shorten(cwd)]);
    try {
      const branch = (await run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"])).trim();
      if (branch) rows.push(["branch", branch]);
    } catch { /* Non-repositories have no branch. */ }
  }
  const body = text.replace(/\n+$/, "");
  const origin = await findSource(body, cwd);
  const count = body.split("\n").length;
  let shape = `${count} line${count === 1 ? "" : "s"}, ${Array.from(body).length} chars`;
  if (source?.row !== undefined && !origin) shape += `, screen row ${source.row}`;
  rows.push(["selection", shape]);
  if (origin) rows.push(["file", origin]);
  const files = filesIn(body, cwd).filter(file => !origin || file.replace(/:\d+$/, "") !== origin.replace(/:\d+$/, ""));
  if (files.length) rows.push(["files", files.join(" ")]);
  return rows;
}
export function theme(): Record<string, string> {
  const root = process.env.XDG_CONFIG_HOME || (process.platform === "win32"
    ? process.env.APPDATA || join(homedir(), "AppData", "Roaming") : join(homedir(), ".config"));
  const config = process.env.HERDR_CONFIG_PATH || join(root, "herdr", "config.toml");
  try {
    const parsed = Bun.TOML.parse(readFileSync(config, "utf8")) as { theme?: { custom?: Record<string, unknown> } };
    return Object.fromEntries(Object.entries(parsed.theme?.custom || {}).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(entry[1])));
  } catch { return {}; }
}
