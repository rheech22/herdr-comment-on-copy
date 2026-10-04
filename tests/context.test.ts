import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildContext, filesIn, findSource, theme } from "../src/context.ts";
import { fakeApi } from "./helpers.ts";

const directories: string[] = [];
const originalConfig = process.env.HERDR_CONFIG_PATH;
const originalXdg = process.env.XDG_CONFIG_HOME;
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (originalConfig === undefined) delete process.env.HERDR_CONFIG_PATH;
  else process.env.HERDR_CONFIG_PATH = originalConfig;
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
});
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "comment-context-"));
  directories.push(dir);
  return dir;
}
describe("copy-time context", () => {
  test("missing pane and APIs still preserve Herdr provenance and selection shape", async () => {
    const api = fakeApi(() => { throw new Error("offline"); });
    const context = await buildContext(api, null, "한글🙂\nsecond\n", null);
    expect(context.find(([name]) => name === "source")?.[1]).toContain("Herdr");
    expect(context.find(([name]) => name === "capture")?.[1]).toContain("when opening this comment");
    expect(context).toContainEqual(["selection", "2 lines, 10 chars"]);
    expect(context.some(([name]) => ["pane", "workspace", "tab"].includes(name))).toBe(false);
  });
  test("source detection points at the selection's first line", async () => {
    const cwd = directory();
    writeFileSync(join(cwd, "source.ts"), "// unrelated\nconst firstLine = true;\nconst secondLine = 'the longest matching line in this fixture';\n");
    expect(await findSource("const firstLine = true;\nconst secondLine = 'the longest matching line in this fixture';", cwd)).toBe("source.ts:2");
  });
  test("foreground program is distinct from the pane's detected agent", async () => {
    const api = fakeApi(method => {
      if (method === "pane.get") return { result: { pane: { pane_id: "p1", agent: "codex" } } };
      if (method === "pane.process_info") return { result: { process_info: { foreground_processes: [
        { name: "nvim", argv: ["nvim", "private-file.txt"] }, { name: "nvim" },
        { argv0: "C:\\tools\\helper.exe" },
      ] } } };
      return { result: {} };
    });
    const context = await buildContext(api, "p1", "selected text", { pane_id: "p1", row: 0 });
    expect(context).toContainEqual(["pane", "p1"]);
    expect(context).toContainEqual(["process", "nvim, helper.exe"]);
    expect(context).toContainEqual(["agent", "codex"]);
    expect(JSON.stringify(context)).not.toContain("private-file.txt");
  });
  test("unavailable process info preserves the agent without inventing a shell", async () => {
    const api = fakeApi(method => {
      if (method === "pane.get") return { result: { pane: { pane_id: "p1", agent: "codex" } } };
      throw new Error("unavailable");
    });
    const context = await buildContext(api, "p1", "selected text", null);
    expect(context).toContainEqual(["pane", "p1"]);
    expect(context).toContainEqual(["agent", "codex"]);
    expect(context.some(([name]) => name === "process")).toBe(false);
  });
  test("ambiguous source matches and short text omit the file", async () => {
    const cwd = directory();
    const selection = "this sufficiently long selection exists in several files";
    for (let i = 0; i < 4; i++) writeFileSync(join(cwd, `source-${i}.txt`), selection);
    expect(await findSource(selection, cwd)).toBeNull();
    expect(await findSource("short", cwd)).toBeNull();
  });
  test("files mentioned in selections must exist", () => {
    const cwd = directory();
    writeFileSync(join(cwd, "한글.ts"), "");
    expect(filesIn("한글.ts:12 missing.ts 한글.ts:12", cwd)).toEqual(["한글.ts:12"]);
  });
  test("native absolute paths retain drive letters and line numbers", () => {
    const cwd = directory();
    const file = join(cwd, "source.ts");
    writeFileSync(file, "");
    expect(filesIn(`${file}:12 ${file}:12`, cwd)).toEqual([`${file}:12`]);
  });
  test("theme parses only custom colors and honors config overrides", () => {
    const cwd = directory();
    const config = join(cwd, "config.toml");
    writeFileSync(config, '[theme.custom]\naccent = "#957fb8"\ntext = "reset"\ngreen = "#abc"\nbad = "#abcd"\n');
    process.env.HERDR_CONFIG_PATH = config;
    expect(theme()).toEqual({ accent: "#957fb8", green: "#abc" });
    writeFileSync(config, "invalid = [");
    expect(theme()).toEqual({});
  });
  test("theme respects Herdr's XDG config location independently of socket transport", () => {
    const root = directory();
    mkdirSync(join(root, "herdr"));
    writeFileSync(join(root, "herdr", "config.toml"), '[theme.custom]\naccent = "#957fb8"\n');
    delete process.env.HERDR_CONFIG_PATH;
    process.env.XDG_CONFIG_HOME = root;
    expect(theme()).toEqual({ accent: "#957fb8" });
  });
});
