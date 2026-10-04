import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, sep, parse, resolve } from "node:path";
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
/** Source lookup is optional, repository-scoped, and has one budget for every subprocess. */
export async function findSource(text: string, cwd?: string, signal?: AbortSignal): Promise<string | null> {
  if (!cwd || signal?.aborted || resolve(cwd) === resolve(homedir()) || resolve(cwd) === parse(resolve(cwd)).root) return null;
  const lines = text.split("\n").map(line => line.trim());
  const needle = lines.reduce((a, b) => Array.from(a).length >= Array.from(b).length ? a : b, "");
  if (Array.from(needle).length < 30) return null;
  const deadline = performance.now() + 500;
  const execute = (argv: string[], limit = 500) => {
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0 || signal?.aborted) throw new Error("Source lookup expired");
    return run(argv, Math.min(limit, remaining), signal);
  };
  try {
    const root = (await execute(["git", "-C", cwd, "rev-parse", "--show-toplevel"], 150)).trim();
    if (!root || resolve(root) === resolve(homedir()) || resolve(root) === parse(resolve(root)).root) return null;
    const hits = (await execute(["rg", "--fixed-strings", "--line-number", "--max-count", "1", "--no-messages", "--", needle, root]))
      .trim().split("\n").filter(Boolean);
    if (hits.length !== 1) return null;
    const hit = /^(.*?):(\d+):/.exec(hits[0]!);
    if (!hit) return null;
    const path = hit[1]!;
    let line = hit[2]!;
    const head = lines.find(value => Array.from(value).length >= 12);
    if (head && head !== needle) {
      try {
        const first = await execute(["rg", "--fixed-strings", "--line-number", "--max-count", "1", "--no-messages", "--", head, path]);
        const match = /^(\d+):/.exec(first);
        if (match) line = match[1]!;
      } catch { /* Keep the line from the longest match. */ }
    }
    return `${relative(realpathSync(cwd), realpathSync(path))}:${line}`;
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
export function selectionContext(paneId: string | null, text: string, source: Source | null): Context {
  const body = text.replace(/\n+$/, "");
  const count = body.split("\n").length;
  const shape = `${count} line${count === 1 ? "" : "s"}, ${Array.from(body).length} chars`;
  return [
    ["source", "Herdr (terminal workspace manager for AI agents) / Comment on Copy"],
    ["capture", "Selected/copied terminal text and available Herdr pane metadata, captured when opening this comment."],
    ...(paneId ? [["pane", paneId] as [string, string]] : []),
    ["selection", shape + (source?.row !== undefined ? `, screen row ${source.row}` : "")],
  ];
}
export async function buildContext(api: Herdr, paneId: string | null, text: string, source: Source | null,
  options: { signal?: AbortSignal; update?: (context: Context) => void } = {}): Promise<Context> {
  const { signal } = options;
  const panePromise = paneId ? api.result<{ pane: Pane }>("pane.get", { pane_id: paneId })
    .then(result => result.pane || {}).catch(() => ({} as Partial<Pane>)) : Promise.resolve({} as Partial<Pane>);
  const [pane, spaces, tabs, processName] = await Promise.all([
    panePromise, api.labels("workspace.list", "workspaces", "workspace_id"),
    api.labels("tab.list", "tabs", "tab_id"), paneId ? running(api, paneId) : null,
  ]);
  if (signal?.aborted) return selectionContext(paneId, text, source);
  const rows = selectionContext(paneId, text, source).filter(([key]) => !["pane", "selection"].includes(key));
  if (pane.workspace_id) rows.push(["workspace", spaces.get(pane.workspace_id) || pane.workspace_id]);
  if (pane.tab_id) rows.push(["tab", tabs.get(pane.tab_id) || pane.tab_id]);
  if (paneId) rows.push(["pane", paneId]);
  if (processName) rows.push(["process", processName]);
  if (pane.agent) rows.push(["agent", pane.agent]);
  if (pane.terminal_title_stripped) rows.push(["title", pane.terminal_title_stripped]);
  const cwd = pane.foreground_cwd || pane.cwd;
  if (cwd) rows.push(["cwd", shorten(cwd)]);
  const selection = selectionContext(paneId, text, source).find(([key]) => key === "selection")!;
  rows.push(selection);
  const body = text.replace(/\n+$/, "");
  const files = filesIn(body, cwd);
  if (files.length) rows.push(["files", files.join(" ")]);
  const publish = () => { if (!signal?.aborted) options.update?.(rows.map(([key, value]) => [key, value])); };
  publish();
  if (!cwd || signal?.aborted) return rows;
  // Neither Git nor source-file discovery holds up pane metadata or the popup.
  await Promise.all([
    run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], 150, signal).then(value => {
      const branch = value.trim();
      if (branch) { rows.push(["branch", branch]); publish(); }
    }).catch(() => {}),
    findSource(body, cwd, signal).then(origin => {
      if (!origin) return;
      selection[1] = selection[1].replace(/, screen row \d+$/, "");
      rows.push(["file", origin]);
      const remaining = files.filter(file => file.replace(/:\d+$/, "") !== origin.replace(/:\d+$/, ""));
      const index = rows.findIndex(([key]) => key === "files");
      if (index >= 0) {
        if (remaining.length) rows[index] = ["files", remaining.join(" ")]; else rows.splice(index, 1);
      }
      publish();
    }),
  ]);
  return rows;
}
export function contextSummary(context: Context = []): string {
  const values = new Map(context);
  const workspace = values.get("workspace"), cwd = values.get("cwd");
  const path = values.get("file") || (cwd?.split(/[\\/]/).filter(Boolean).at(-1) === workspace ? undefined : cwd);
  return [...new Set([workspace, values.get("process"), path,
    values.get("branch")].filter((value): value is string => !!value))]
    .map(value => value.replace(/[\x00-\x1f\x7f]/g, " ")).join(" · ");
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
