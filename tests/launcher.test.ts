import { expect, test } from "bun:test";
import { cpSync, existsSync, linkSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Socket } from "node:net";
import { socketPath } from "./helpers.ts";
import type { Payload } from "../src/types.ts";

test("manifest builds and opens comments and collection with Bun missing from the server PATH", async () => {
  // A checkout with spaces also exercises native Windows command quoting.
  const root = mkdtempSync(join(tmpdir(), "comment launcher "));
  const project = join(root, "plugin checkout");
  const home = join(root, "user home");
  const state = join(root, "state");
  const scripts = join(project, "scripts");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(state);
  const bin = join(home, ".bun", "bin");
  mkdirSync(bin, { recursive: true });
  const runtime = join(bin, process.platform === "win32" ? "bun.exe" : "bun");
  try { linkSync(process.execPath, runtime); } catch { copyFileSync(process.execPath, runtime); }
  for (const file of ["run.ts", "run.sh", "run.cmd", "run.ps1"]) {
    copyFileSync(join(import.meta.dir, "../scripts", file), join(scripts, file));
  }
  cpSync(join(import.meta.dir, "../src"), join(project, "src"), { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "launcher-fixture", private: true }));
  const socket = socketPath(root);
  const clients = new Set<Socket>();
  const calls: string[] = [];
  const server = createServer(client => {
    clients.add(client); client.once("close", () => clients.delete(client));
    client.setEncoding("utf8");
    let buffer = "";
    client.on("data", chunk => {
      buffer += chunk;
      if (!buffer.includes("\n")) return;
      const request = JSON.parse(buffer.slice(0, buffer.indexOf("\n")));
      calls.push(request.method);
      const result = request.method === "pane.current" ? { pane: { pane_id: "source" } } : {};
      client.end(JSON.stringify({ result }) + "\n");
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  const windows = process.platform === "win32";
  const system = process.env.SystemRoot || "C:\\Windows";
  // Clear both possible PATH spellings on Windows.
  const env: Record<string, string | undefined> = { ...process.env, HOME: home, USERPROFILE: home,
    COMMENT_ON_COPY_BUN: "", HERDR_PLUGIN_STATE_DIR: state, HERDR_SOCKET_PATH: socket,
    HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ selected_text: "copied selection", focused_pane_id: "source" }) };
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  env.PATH = windows ? join(system, "System32") : "/usr/bin:/bin";
  const manifest = Bun.TOML.parse(readFileSync(join(import.meta.dir, "../herdr-plugin.toml"), "utf8")) as {
    build: { command: string[]; platforms: string[] }[];
    actions: { id: string; command: string[] }[];
    panes: { command: string[] }[];
  };
  const platform = windows ? "windows" : process.platform === "darwin" ? "macos" : "linux";
  const execute = async (argv: string[], override: Record<string, string> = {}) => {
    const [program, ...args] = argv;
    const resolved = !isAbsolute(program!) && program!.includes("/") ? join(project, program!) : program!;
    // Herdr uses ComSpec for .cmd files, and direct execution for Unix scripts.
    const command = windows && resolved.endsWith(".cmd")
      ? [process.env.ComSpec || join(system, "System32", "cmd.exe"), "/d", "/c", resolved, ...args] : [resolved, ...args];
    const child = Bun.spawn(command, { cwd: project, env: { ...env, ...override }, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, status] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    return { stdout, stderr, status };
  };
  try {
    const build = manifest.build.find(item => item.platforms.includes(platform))!;
    const installed = await execute(build.command);
    expect(installed.status).toBe(0);
    expect(existsSync(join(scripts, "launch.cmd"))).toBe(true);
    for (const action of ["open", "collection"]) {
      const result = await execute(manifest.actions.find(item => item.id === action)!.command);
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      const payload = JSON.parse(readFileSync(join(state, "payload.json"), "utf8")) as Payload;
      expect(payload.view).toBe(action === "open" ? "comment" : "collection");
      expect(payload.agents_pending).toBe(true);
      if (action === "open") expect(payload.text).toBe("copied selection");
      rmSync(join(state, "popup.lock"));
    }
    expect(calls.filter(method => method === "plugin.pane.open")).toHaveLength(2);
    expect(calls).not.toContain("pane.get");
    expect(calls).not.toContain("agent.list");
    const rejected = await execute(manifest.actions[0]!.command, { COMMENT_ON_COPY_BUN: join(home, "missing-bun") });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("Bun 1.3.0+");
    // Every pane and action must use the same prepared, non-Bun entrypoint.
    for (const entry of [...manifest.actions, ...manifest.panes]) expect(entry.command[0]).toBe("scripts/launch.cmd");
  } finally {
    for (const client of clients) client.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(root, { recursive: true, force: true });
  }
}, 20000);
