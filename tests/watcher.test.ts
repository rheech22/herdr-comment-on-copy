import { expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { socketPath } from "./helpers.ts";
import type { Payload } from "../src/types.ts";
import { compose } from "../src/model.ts";

test("daemon filters external copies, captures context, stops cleanly, and allows manual fallback", async () => {
  const root = mkdtempSync(join(tmpdir(), "coc-watch-"));
  const state = join(root, "state");
  mkdirSync(state);
  const clipboard = join(root, "clipboard");
  const front = join(root, "front");
  const log = join(root, "herdr.log");
  writeFileSync(front, "kitty");
  writeFileSync(clipboard, "initial clipboard");
  writeFileSync(log, "");
  const socket = socketPath(root);
  const clients = new Set<Socket>();
  const metadata: Record<string, unknown>[] = [];
  let paneText: string | undefined;
  let rejectPopup = false;
  const server = createServer(client => {
    clients.add(client);
    client.once("close", () => clients.delete(client));
    client.setEncoding("utf8");
    let buffer = "";
    client.on("data", chunk => {
      buffer += chunk;
      const end = buffer.indexOf("\n");
      if (end < 0) return;
      const request = JSON.parse(buffer.slice(0, end)) as { method: string; params: Record<string, unknown> };
      let result: unknown = {};
      switch (request.method) {
        case "workspace.list": result = { workspaces: [{ workspace_id: "w1", label: "test" }] }; break;
        case "tab.list": result = { tabs: [{ tab_id: "t1", label: "code" }] }; break;
        case "pane.current": result = { pane: { pane_id: "shell" } }; break;
        case "pane.list": result = { panes: [{ pane_id: "shell", focused: true, label: "editor" }] }; break;
        case "pane.read": result = { read: { text: paneText ?? readFileSync(clipboard, "utf8") } }; break;
        case "pane.get": result = { pane: { pane_id: "shell", workspace_id: "w1", tab_id: "t1" } }; break;
        case "pane.process_info": result = { process_info: { foreground_processes: [{ name: "nvim" }] } }; break;
        case "agent.list": result = { agents: [{ pane_id: "w1:p1", workspace_id: "w1", tab_id: "t1", agent: "claude" }] }; break;
        case "workspace.report_metadata": metadata.push(request.params); break;
        case "plugin.pane.open":
          if (request.params.target_pane_id) {
            client.end(JSON.stringify({ error: { message: "overlay and popup plugin panes target the active pane" } }) + "\n");
            return;
          }
          if (rejectPopup) { client.end(JSON.stringify({ error: { message: "Popup unavailable" } }) + "\n"); return; }
          writeFileSync(log, readFileSync(log, "utf8") + "popup\n"); break;
        case "notification.show": writeFileSync(log, readFileSync(log, "utf8") + String(request.params.title) + "\n"); break;
      }
      client.end(JSON.stringify({ result }) + "\n");
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  const env = { ...process.env, HERDR_PLUGIN_STATE_DIR: state, HERDR_SOCKET_PATH: socket,
    MOCK_CLIPBOARD: clipboard, MOCK_FRONT: front };
  let watcher: number | undefined;
  const pidFile = join(state, "watch.pid");
  const runToggle = async (unsupported = false) => {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/watcher.ts")], {
      env: { ...env, MOCK_UNSUPPORTED: unsupported ? "1" : "" }, stdout: "pipe", stderr: "pipe" });
    const error = await new Response(child.stderr).text();
    if (unsupported) {
      expect(await child.exited).not.toBe(0);
      expect(error).toContain("Watcher did not start");
      return;
    }
    expect(await child.exited).toBe(0);
    expect(error).toBe("");
  };
  const wait = async (predicate: () => boolean) => {
    for (let i = 0; i < 200 && !predicate(); i++) await Bun.sleep(20);
    expect(predicate()).toBe(true);
  };
  try {
    // A PID reused by an unrelated process must never receive SIGTERM.
    writeFileSync(pidFile, String(process.pid));
    await runToggle();
    watcher = Number(readFileSync(pidFile, "utf8"));
    expect(watcher).not.toBe(process.pid);
    await wait(() => metadata.some(row => row.ttl_ms === 15000));
    writeFileSync(front, "Firefox");
    await Bun.sleep(450);
    writeFileSync(clipboard, "copied from browser");
    await Bun.sleep(800);
    expect(existsSync(join(state, "payload.json"))).toBe(false);
    writeFileSync(front, "kitty");
    paneText = "unrelated Herdr pane contents";
    await Bun.sleep(450);
    writeFileSync(clipboard, "copied from another terminal");
    await Bun.sleep(800);
    expect(existsSync(join(state, "payload.json"))).toBe(false);
    paneText = undefined;
    writeFileSync(clipboard, "copied 한글 text");
    await wait(() => existsSync(join(state, "payload.json")));
    const initial = JSON.parse(readFileSync(join(state, "payload.json"), "utf8")) as Payload;
    expect(initial.agents_pending).toBe(true);
    expect(initial.agents).toBeUndefined();
    expect(initial.context).toContainEqual(["pane", "shell"]);
    await wait(() => readFileSync(log, "utf8").includes("popup"));
    const enriched = Bun.spawn([process.execPath, join(import.meta.dir, "fixtures/watcher.ts"), "enrich"], { env, stdout: "pipe", stderr: "pipe" });
    const payload = JSON.parse(await new Response(enriched.stdout).text()) as Payload;
    expect(await enriched.exited).toBe(0);
    expect(payload.text).toBe("copied 한글 text");
    expect(payload.source?.pane_id).toBe("shell");
    expect(payload.origin?.tab_id).toBe("t1");
    expect(payload.agents?.[0]?.name).toBe("claude · test");
    expect(payload.context).toContainEqual(["pane", "shell"]);
    expect(payload.context).toContainEqual(["process", "nvim"]);
    const prompt = compose(payload, "Explain this selection.");
    expect(prompt).toContain("source: Herdr (terminal workspace manager for AI agents) / Comment on Copy");
    expect(prompt).toContain("captured when opening this comment");
    expect(prompt).toContain("copied 한글 text");
    await wait(() => readFileSync(log, "utf8").includes("popup"));
    // Let the watcher observe that a popup is open, then simulate closing it.
    await Bun.sleep(400);
    writeFileSync(clipboard, "composed popup output");
    rmSync(join(state, "popup.lock"));
    await Bun.sleep(800);
    expect(readFileSync(log, "utf8").match(/popup/g)?.length).toBe(1);
    await runToggle();
    await wait(() => !existsSync(pidFile));
    expect(metadata.at(-1)?.ttl_ms).toBe(1);
    expect(readFileSync(log, "utf8")).toContain("comment on copy: off");
    expect(existsSync(join(state, "watch.stop"))).toBe(false);
    await wait(() => { try { process.kill(watcher!, 0); return false; } catch { return true; } });
    watcher = undefined;
    await runToggle(true);
    expect(existsSync(pidFile)).toBe(false);
    expect(readFileSync(log, "utf8").match(/comment on copy: on/g)?.length).toBe(1);
    const selected = "manual 한글 selection";
    const runOpen = async (action = "open") => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "../scripts/run.ts"), action], {
        env: { ...env, PATH: "", DISPLAY: "", WAYLAND_DISPLAY: "",
          HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ selected_text: selected, focused_pane_id: "shell" }) },
        stdout: "pipe", stderr: "pipe" });
      const error = await new Response(child.stderr).text();
      return { status: await child.exited, error };
    };
    expect(await runOpen()).toEqual({ status: 0, error: "" });
    const manual = JSON.parse(readFileSync(join(state, "payload.json"), "utf8")) as Payload;
    expect(manual.text).toBe(selected);
    expect(manual.source).toEqual({ pane_id: "shell" });
    expect(compose(manual, "Review this selection.")).toContain("source: Herdr");
    expect(manual.context?.find(([name]) => name === "selection")?.[1]).toBe("1 line, 19 chars");
    const duplicate = await runOpen();
    expect(duplicate.status).not.toBe(0);
    expect(duplicate.error).toContain("already open");
    rmSync(join(state, "popup.lock"));
    expect(await runOpen("collection")).toEqual({ status: 0, error: "" });
    const collection = JSON.parse(readFileSync(join(state, "payload.json"), "utf8")) as Payload;
    expect(collection.view).toBe("collection");
    expect(collection.text).toBe("");
    expect(collection.context).toEqual([]);
    expect(collection.agents_pending).toBe(true);
    rmSync(join(state, "popup.lock"));
    rejectPopup = true;
    const failure = await runOpen();
    expect(failure.status).not.toBe(0);
    expect(failure.error).toContain("Popup unavailable");
    expect(existsSync(join(state, "popup.lock"))).toBe(false);
  } finally {
    if (watcher) { try { process.kill(watcher, "SIGTERM"); } catch {} }
    for (const client of clients) client.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 45000);
