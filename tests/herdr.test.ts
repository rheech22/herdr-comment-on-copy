import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server, type Socket } from "node:net";
import { call, indicator } from "../src/herdr.ts";
import { fakeApi, socketPath } from "./helpers.ts";

let server: Server | undefined;
let directory: string | undefined;
const clients = new Set<Socket>();
const originalSocket = process.env.HERDR_SOCKET_PATH;
afterEach(async () => {
  for (const client of clients) client.destroy();
  clients.clear();
  if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
  server = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (originalSocket === undefined) delete process.env.HERDR_SOCKET_PATH;
  else process.env.HERDR_SOCKET_PATH = originalSocket;
});

describe("Herdr API", () => {
  test("native local socket transport handles fragmented JSON and Unicode", async () => {
    directory = mkdtempSync(join(tmpdir(), "comment-socket-"));
    const socket = socketPath(directory);
    process.env.HERDR_SOCKET_PATH = process.platform === "win32" ? socket.replace(/\\/g, "/") : socket;
    let received = "";
    server = createServer(client => {
      clients.add(client);
      client.setEncoding("utf8");
      client.on("data", chunk => {
        received += chunk;
        if (!received.includes("\n")) return;
        client.write('{"result":{"text":"');
        setTimeout(() => client.end('한글🙂"}}\n'), 1);
      });
    });
    await new Promise<void>(resolve => server!.listen(socket, resolve));
    expect(await call("test.echo", { text: "안녕" })).toEqual({ result: { text: "한글🙂" } });
    expect(JSON.parse(received)).toEqual({ id: "comment_on_copy", method: "test.echo", params: { text: "안녕" } });
  });
  test("incomplete socket replies fail instead of hanging", async () => {
    directory = mkdtempSync(join(tmpdir(), "comment-socket-"));
    const socket = socketPath(directory);
    process.env.HERDR_SOCKET_PATH = socket;
    server = createServer(client => {
      clients.add(client);
      client.resume();
      client.end('{"result":');
    });
    await new Promise<void>(resolve => server!.listen(socket, resolve));
    await expect(call("test", {})).rejects.toThrow("complete reply");
  });
  test("closing a popup cancels an in-flight socket request without waiting for its timeout", async () => {
    directory = mkdtempSync(join(tmpdir(), "comment-socket-"));
    const socket = socketPath(directory);
    process.env.HERDR_SOCKET_PATH = socket;
    let connected!: () => void;
    const ready = new Promise<void>(resolve => { connected = resolve; });
    server = createServer(client => { clients.add(client); client.resume(); connected(); });
    await new Promise<void>(resolve => server!.listen(socket, resolve));
    const controller = new AbortController();
    const request = call("test.wait", {}, controller.signal);
    await ready;
    controller.abort();
    await expect(request).rejects.toThrow("cancelled");
  });
  test("agent labels only gain suffixes when ambiguous", async () => {
    const api = fakeApi(method => {
      if (method === "agent.list") return { result: { agents: [
        { pane_id: "w1:p1", workspace_id: "w1", tab_id: "t1", agent: "claude" },
        { pane_id: "w1:p2", workspace_id: "w1", tab_id: "t1", agent: "claude" },
        { pane_id: "w1:p3", workspace_id: "w1", tab_id: "t2", agent: "codex" },
      ] } };
      if (method === "workspace.list") return { result: { workspaces: [{ workspace_id: "w1", label: "main" }] } };
      return { result: { tabs: [{ tab_id: "t1", label: "code" }, { tab_id: "t2", label: "review" }] } };
    });
    expect((await api.agents()).map(agent => agent.name)).toEqual(["claude · main · code · p1", "claude · main · code · p2", "codex · main"]);
  });
  test("locate finds the selection in the focused pane first", async () => {
    const requested: unknown[] = [];
    const api = fakeApi((method, params) => {
      if (method === "pane.list") return { result: { panes: [
        { pane_id: "other" }, { pane_id: "focused", focused: true, label: "editor" },
      ] } };
      requested.push(params.pane_id);
      return { result: { read: { text: "🙂 copied selection" } } };
    });
    expect(await api.locate("copied selection")).toEqual({ pane_id: "focused", row: 0 });
    expect(requested).toEqual(["focused"]);
  });
  test("Markdown, links, terminal wrapping and short first lines do not prevent source matching", async () => {
    const cases = [
      ["---\nmeaningful selected contents", "---\nmeaningful selected contents", undefined],
      ["## Important title\nA meaningful **bold sentence**.", "Important title\nA meaningful bold sentence.", 0],
      ["Visit [Herdr documentation](https://herdr.dev).", "Visit Herdr documentation.", 0],
      ["a_long_identifier_here", "a_long_ident\nifier_here", 0],
      ["```ts\nconst selected = true;\n```", "const selected = true;", undefined],
      ["first generic label\na distinctive selected sentence", "only a distinctive selected sentence", undefined],
    ] as const;
    for (const [selection, screen, row] of cases) {
      const api = fakeApi(method => ({ result: method === "pane.list" ? { panes: [{ pane_id: "p1", focused: true }] } : { read: { text: screen } } }));
      expect(await api.locate(selection)).toEqual({ pane_id: "p1", ...(row === undefined ? {} : { row }) });
    }
  });
  test("decoration and a single shared short label do not establish a source", async () => {
    const api = fakeApi(method => ({ result: method === "pane.list" ? { panes: [{ pane_id: "p1", focused: true }] } : { read: { text: "title\ncompletely unrelated output" } } }));
    expect(await api.locate("---\n```\n┌───┐")).toBeNull();
    expect(await api.locate("title\nunique selected contents")).toBeNull();
  });
  test("source matching retries a focused pane after a transient redraw", async () => {
    let reads = 0;
    const api = fakeApi(method => ({ result: method === "pane.list" ? { panes: [{ pane_id: "p1", focused: true }] } : { read: { text: ++reads === 1 ? "loading screen" : "original selected content" } } }));
    expect(await api.locate("original selected content")).toEqual({ pane_id: "p1", row: 0 });
    expect(reads).toBe(2);
  });
  test("a stalled source request has a bounded wait before abandoning the capture", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const api = fakeApi(async method => {
      if (method === "pane.list") return { result: { panes: [{ pane_id: "p1", focused: true }] } };
      await gate;
      return { result: { read: { text: "unrelated" } } };
    });
    try {
      expect(await Promise.race([api.locate("original selected contents"), Bun.sleep(600).then(() => "stalled")])).toBeNull();
    } finally { release(); }
  });
  test("metadata expires after the watcher stops refreshing", async () => {
    const calls: Record<string, unknown>[] = [];
    const api = fakeApi((method, params) => {
      if (method === "workspace.list") return { result: { workspaces: [{ workspace_id: "w1" }] } };
      calls.push(params);
      return { result: {} };
    });
    await api.mark(true);
    await api.mark(false);
    expect(calls).toEqual([
      { workspace_id: "w1", source: "comment_on_copy", tokens: { comment_on_copy: "[c]" }, ttl_ms: 15000 },
      { workspace_id: "w1", source: "comment_on_copy", tokens: { comment_on_copy: "" }, ttl_ms: 1 },
    ]);
  });
  test("a matching nonfocused pane opens without waiting for a slow peer", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const reads: unknown[] = [];
    const api = fakeApi(async (method, params) => {
      if (method === "pane.list") return { result: { panes: [
        { pane_id: "focused", focused: true }, { pane_id: "slow" }, { pane_id: "match" },
      ] } };
      reads.push(params.pane_id);
      if (params.pane_id === "slow") await gate;
      return { result: { read: { text: params.pane_id === "match" ? "copied selection" : "unrelated" } } };
    });
    try {
      const found = await Promise.race([api.locate("copied selection"), Bun.sleep(200).then(() => "timed out")]);
      expect(found).toEqual({ pane_id: "match", row: 0 });
      expect(reads).toEqual(["focused", "slow", "match"]);
    } finally { release(); }
  });
  test("indicator defaults to ASCII and accepts a configured Nerd Font glyph", () => {
    directory = mkdtempSync(join(tmpdir(), "comment-indicator-"));
    const config = join(directory, "config.toml");
    const env = { HERDR_PLUGIN_CONFIG_DIR: directory };
    expect(indicator({})).toBe("[c]");
    expect(indicator(env)).toBe("[c]");
    writeFileSync(config, 'indicator = ""\n');
    expect(indicator(env)).toBe("");
    expect(indicator({ ...env, COMMENT_ON_COPY_INDICATOR: "custom" })).toBe("custom");
    for (const content of ['indicator = ""', 'indicator = 123', 'indicator = "\\n"', 'invalid = [']) {
      writeFileSync(config, content);
      expect(indicator(env)).toBe("[c]");
    }
  });
});
