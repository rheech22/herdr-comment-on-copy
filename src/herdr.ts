import { createConnection } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, ApiReply, Call, Pane, Source } from "./types.ts";
import { matchSelection } from "./selection.ts";

export function indicator(env: NodeJS.ProcessEnv = process.env): string {
  let value: unknown = env.COMMENT_ON_COPY_INDICATOR;
  if (value === undefined && env.HERDR_PLUGIN_CONFIG_DIR) {
    try {
      value = (Bun.TOML.parse(readFileSync(join(env.HERDR_PLUGIN_CONFIG_DIR, "config.toml"), "utf8")) as { indicator?: unknown }).indicator;
    } catch { /* Use the portable default when no valid config is available. */ }
  }
  return typeof value === "string" && value.trim() && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : "[c]";
}

export const call = <T>(method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<ApiReply<T>> => {
  if (signal?.aborted) return Promise.reject(new Error("Herdr request cancelled"));
  let path = process.env.HERDR_SOCKET_PATH;
  if (path?.startsWith("//./pipe/")) path = path.replace(/\//g, "\\");
  if (!path) return Promise.reject(new Error("HERDR_SOCKET_PATH is missing; launch through Herdr."));
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = "";
    let settled = false;
    const cancel = () => finish(new Error("Herdr request cancelled"));
    function finish(error?: Error, reply?: ApiReply<T>) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      socket.destroy();
      if (error) reject(error); else resolve(reply!);
    }
    signal?.addEventListener("abort", cancel, { once: true });
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => finish(new Error(`Herdr API timed out: ${method}`)));
    socket.on("error", (error) => finish(error));
    socket.on("connect", () => socket.write(JSON.stringify({ id: "comment_on_copy", method, params }) + "\n"));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 8 * 1024 * 1024) return finish(new Error("Herdr response is too large"));
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      try { finish(undefined, JSON.parse(buffer.slice(0, end)) as ApiReply<T>); }
      catch { finish(new Error("Invalid Herdr API response")); }
    });
    socket.on("end", () => finish(new Error("Herdr socket closed before a complete reply")));
  });
};

export class Herdr {
  constructor(readonly request: Call = call) {}
  /** Share requests only within one capture, never across changes in the workspace. */
  snapshot(signal?: AbortSignal) {
    const requests = new Map<string, Promise<ApiReply<unknown>>>();
    return new Herdr(<T>(method: string, params: Record<string, unknown>) => {
      const key = JSON.stringify([method, params]);
      if (!requests.has(key)) requests.set(key, this.request === call ? call(method, params, signal) : this.request(method, params));
      return requests.get(key)! as Promise<ApiReply<T>>;
    });
  }
  async result<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const reply = await this.request<T>(method, params);
    if (reply.error) throw new Error(reply.error.message);
    if (!reply.result) throw new Error(`Missing result: ${method}`);
    return reply.result;
  }
  async labels(method: string, key: "workspaces" | "tabs", id: "workspace_id" | "tab_id") {
    try {
      const result = await this.result<Record<string, { workspace_id?: string; tab_id?: string; label?: string }[]>>(method);
      return new Map((result[key] || []).filter(row => row[id]).map(row => [row[id]!, row.label || row[id]!]));
    } catch { return new Map<string, string>(); }
  }
  async agents(): Promise<Agent[]> {
    try {
      const { agents } = await this.result<{ agents: Pane[] }>("agent.list");
      const [spaces, tabs] = await Promise.all([
        this.labels("workspace.list", "workspaces", "workspace_id"), this.labels("tab.list", "tabs", "tab_id"),
      ]);
      const rows: Agent[] = agents.filter(row => row.pane_id).map(row => ({
        pane_id: row.pane_id, pane_no: row.pane_id.split(":").at(-1)!,
        workspace_id: row.workspace_id, tab_id: row.tab_id, agent: row.agent || "agent",
        workspace: spaces.get(row.workspace_id || "") || row.workspace_id || "?",
        tab: tabs.get(row.tab_id || "") || "", name: "",
      }));
      for (const row of rows) row.name = `${row.agent} · ${row.workspace}`;
      for (const field of ["tab", "pane_no"] as const) {
        const groups = Map.groupBy(rows, row => row.name);
        for (const group of groups.values()) if (group.length > 1) {
          for (const row of group) row.name += ` · ${row[field]}`;
        }
      }
      return rows;
    } catch { return []; }
  }
  async focused(): Promise<string | null> {
    try { return (await this.result<{ pane: Pane }>("pane.current")).pane.pane_id; } catch { return null; }
  }
  async notify(title: string, body: string) {
    try { await this.result("notification.show", { title, body }); } catch { /* Best effort. */ }
  }
  async locate(text: string): Promise<Source | null> {
    if (!matchSelection(text, text)) return null;
    const controller = new AbortController();
    const api = new Herdr(this.request === call ? <T>(method: string, params: Record<string, unknown>) => call<T>(method, params, controller.signal) : this.request);
    let timeout: ReturnType<typeof setTimeout>;
    const deadline = new Promise<null>(resolve => {
      timeout = setTimeout(() => { controller.abort(); resolve(null); }, 250);
    });
    const find = async (): Promise<Source | null> => {
      try {
        const { panes } = await api.result<{ panes: Pane[] }>("pane.list");
        const read = async (pane: Pane): Promise<Source | null> => {
          try {
            const result = await api.result<{ read: { text: string } }>("pane.read", { pane_id: pane.pane_id, source: "visible", format: "text" });
            const match = matchSelection(text, result.read.text);
            if (match) return { pane_id: pane.pane_id, ...match };
          } catch { /* Try the next pane. */ }
          return null;
        };
        const focused = panes.find(pane => pane.focused);
        if (focused) {
          const found = await read(focused);
          if (found) return found;
        }
        const others = panes.filter(pane => pane !== focused);
        for (let index = 0; index < others.length; index += 4) {
          if (controller.signal.aborted) return null;
          const found = await Promise.any(others.slice(index, index + 4).map(async pane => {
            const source = await read(pane);
            if (!source) throw new Error("Selection not found");
            return source;
          })).catch(() => null);
          if (found) return found;
        }
        // One short retry catches redraws without putting a long wait before the popup.
        if (focused && !controller.signal.aborted) {
          await Bun.sleep(40);
          if (!controller.signal.aborted) return read(focused);
        }
      } catch { /* No source is better than a guessed source. */ }
      return null;
    };
    try { return await Promise.race([find(), deadline]); }
    finally { clearTimeout(timeout!); controller.abort(); }
  }
  async mark(on: boolean) {
    try {
      const { workspaces } = await this.result<{ workspaces: { workspace_id: string }[] }>("workspace.list");
      await Promise.allSettled(workspaces.map(space => this.result("workspace.report_metadata", {
        workspace_id: space.workspace_id, source: "comment_on_copy",
        tokens: { comment_on_copy: on ? indicator() : "" }, ttl_ms: on ? 15000 : 1,
      })));
    } catch { /* Metadata expires even if cleanup fails. */ }
  }
}
