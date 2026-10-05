import { describe, expect, test } from "bun:test";
import { compose, deliver, pickTarget, tag } from "../src/model.ts";
import { ClipboardHistory, isTerminal } from "../src/clipboard.ts";
import type { Agent, Payload } from "../src/types.ts";
import { agent, fakeApi } from "./helpers.ts";

describe("prompt and routing", () => {
  test("nested selection tags use a distinct boundary", () => {
    const body = "<selection>one</selection> <selection-2>two</selection-2>";
    expect(tag("selection", body)).toBe(`<selection-3>\n${body}\n</selection-3>`);
  });
  test("context, Korean selection, and multiline comment compose correctly", () => {
    expect(compose({ text: "한글\nselected\n", context: [["workspace", "main"]] }, "Please explain\nthis selection."))
      .toBe("<context>\nworkspace: main\n</context>\n\n<selection>\n한글\nselected\n</selection>\n\n<comment>\nPlease explain\nthis selection.\n</comment>");
  });
  test("missing context is omitted", () => {
    expect(compose({ text: "copied text" }, "comment")).toBe("<selection>\ncopied text\n</selection>\n\n<comment>\ncomment\n</comment>");
  });
  test("comments have their own boundary even when they contain comment tags", () => {
    expect(compose({ text: "selection" }, "  <comment>quoted</comment>\nfeedback  "))
      .toBe("<selection>\nselection\n</selection>\n\n<comment-2>\n<comment>quoted</comment>\nfeedback\n</comment-2>");
    expect(compose({ text: "selection" }, "")).toContain("<comment>\n\n</comment>");
  });
  const first = agent("p1"), second = agent("p2", "t2", "w2");
  const cases: [string, Payload, Agent | null][] = [
    ["source precedes focus", { text: "", agents: [first, second], source: { pane_id: "p1", row: 0 }, focused_pane_id: "p2" }, first],
    ["focus precedes nearby agent", { text: "", agents: [first, second], focused_pane_id: "p2", origin: { pane_id: "shell", tab_id: "t1", workspace_id: "w1" } }, second],
    ["same-tab agent", { text: "", agents: [first, second], origin: { pane_id: "shell", tab_id: "t1" } }, first],
    ["workspace fallback", { text: "", agents: [first, second], origin: { pane_id: "shell", tab_id: "other", workspace_id: "w1" } }, first],
    ["ambiguous destinations require choice", { text: "", agents: [first, agent("p2")], origin: { pane_id: "shell", tab_id: "t1", workspace_id: "w1" } }, null],
    ["only global agent", { text: "", agents: [first] }, first],
    ["no agents", { text: "" }, null],
  ];
  for (const [name, payload, expected] of cases) test(name, () => expect(pickTarget(payload)).toEqual(expected));
});

describe("delivery", () => {
  const payload = { text: "line one\nline two" };
  test("insert uses pane.send_input without submitting", async () => {
    const calls: unknown[] = [];
    const api = fakeApi((method, params) => { calls.push([method, params]); return { result: {} }; });
    const result = await deliver(api, async () => {}, payload, "comment", agent("p1"), false);
    expect(result.close).toBe(true);
    expect(calls).toEqual([["pane.send_input", { pane_id: "p1", text: compose(payload, "comment") }]]);
  });
  test("approval rejection keeps popup open and never copies or inserts", async () => {
    const calls: string[] = [];
    let copied = false;
    const api = fakeApi(method => { calls.push(method); return { error: { message: "approval pending" } }; });
    const result = await deliver(api, async () => { copied = true; }, payload, "comment", agent("p1"), true);
    expect(result).toEqual({ close: false, message: "approval pending", kind: "warn" });
    expect(calls).toEqual(["agent.prompt"]);
    expect(copied).toBe(false);
  });
  test("failed insertion copies a fallback", async () => {
    let copied = "";
    const api = fakeApi(() => ({ error: { message: "gone" } }));
    const result = await deliver(api, async text => { copied = text; }, payload, "comment", agent("p1"), false);
    expect(result.close).toBe(true);
    expect(copied).toBe(compose(payload, "comment") + "\n");
  });
  test("transport failure during submission keeps popup open", async () => {
    const api = fakeApi(() => { throw new Error("socket closed"); });
    expect((await deliver(api, async () => {}, payload, "comment", agent("p1"), true)).close).toBe(false);
  });
  test("empty comments and missing targets send nothing", async () => {
    const api = fakeApi(() => { throw new Error("should never call"); });
    expect((await deliver(api, async () => {}, payload, " ", agent("p1"), true)).message).toContain("empty");
    expect((await deliver(api, async () => {}, payload, "comment", null, false)).message).toContain("choose");
  });
});

describe("clipboard watcher policy", () => {
  test("requires a terminal before and after copying", () => {
    const history = new ClipboardHistory("initial");
    expect(history.observe("initial", "WezTerm")).toBe("unchanged");
    expect(history.observe("new", "WezTerm")).toBe("open");
    expect(history.observe("outside", "Finder")).toBe("outside-terminal");
    expect(history.observe("returning", "WezTerm")).toBe("outside-terminal");
    expect(history.observe("fresh", "WezTerm")).toBe("open");
  });
  test("recognizes terminal hosts across macOS, Windows, X11, and Wayland", () => {
    for (const name of ["WezTerm", "iTerm2", "Terminal", "WindowsTerminal.exe", "conhost", "kitty", "org.gnome.Terminal", "gnome-terminal-server", "org.wezfurlong.wezterm", "foot", "Alacritty alacritty"]) {
      expect(isTerminal(name)).toBe(true);
    }
    for (const name of ["Finder", "Firefox", "Chrome", "Code", "", "forest"]) expect(isTerminal(name)).toBe(false);
  });
  test("previously copied values remain eligible, including retries after source lookup failed", () => {
    const history = new ClipboardHistory("initial");
    history.observe("initial", "WezTerm");
    expect(history.observe("one", "WezTerm")).toBe("open");
    history.observe("two", "WezTerm");
    expect(history.observe("one", "WezTerm")).toBe("open");
  });
  test("only explicit popup output is suppressed; closing alone never consumes the user's next copy", () => {
    const history = new ClipboardHistory("initial");
    history.observe("initial", "WezTerm");
    expect(history.observe("composed prompt", "WezTerm", undefined, true)).toBe("popup-result");
    expect(history.observe("composed prompt", "WezTerm", undefined, true)).toBe("popup-result");
    history.observe("other", "WezTerm");
    expect(history.observe("composed prompt", "WezTerm")).toBe("open");
  });
  test("native clipboard revisions distinguish identical copies from unchanged polls", () => {
    const history = new ClipboardHistory("same", "1");
    expect(history.observe("same", "WezTerm", "1")).toBe("unchanged");
    expect(history.observe("same", "WezTerm", "2")).toBe("open");
    expect(history.observe("same", "WezTerm", "2")).toBe("unchanged");
    expect(history.observe("same", "WezTerm", "3", true)).toBe("popup-result");
    expect(history.observe("same", "WezTerm", "4")).toBe("open");
  });
  test("text-only backends can detect changed text but cannot observe an identical rewrite", () => {
    const history = new ClipboardHistory("same");
    history.observe("same", "kitty");
    expect(history.observe("same", "kitty")).toBe("unchanged");
    expect(history.observe("other", "kitty")).toBe("open");
    expect(history.observe("same", "kitty")).toBe("open");
  });
});
