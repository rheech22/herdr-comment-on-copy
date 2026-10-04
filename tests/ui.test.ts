import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { RGBA, TextAttributes } from "@opentui/core";
import type { ActionButton } from "../src/action-button.ts";
import { mountNote } from "../src/note.ts";
import { agent, fakeApi } from "./helpers.ts";
import type { Payload } from "../src/types.ts";
import { Collection, type CollectionStore } from "../src/collection.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let setup: TestRendererSetup | undefined;
const directories: string[] = [];
function collectionStore() {
  const dir = mkdtempSync(join(tmpdir(), "comment-collection-ui-")); directories.push(dir);
  return new Collection(join(dir, "collection.json"));
}
afterEach(() => {
  setup?.renderer.destroy(); setup = undefined;
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
async function waitUntil(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) await Bun.sleep(10);
  expect(predicate()).toBe(true);
}
async function create(payload: Payload = { text: "selected 한글", agents: [agent("p1")] }, rejected = false,
  store: CollectionStore = collectionStore(), currentAgents = payload.agents || [], copyWait?: () => Promise<void>) {
  setup = await createTestRenderer({ width: 88, height: 20, autoFocus: false, useMouse: true, consoleMode: "disabled" });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const copies: string[] = [];
  let closed = false;
  const ui = mountNote(setup.renderer, payload, {
    api: fakeApi((method, params) => {
      calls.push({ method, params });
      if (method === "agent.list") return { result: { agents: currentAgents } };
      return rejected ? { error: { message: "approval pending" } } : { result: {} };
    }), copy: async text => { copies.push(text); await copyWait?.(); }, close: () => { closed = true; }, closeDelay: 0, collection: store,
    colors: { accent: "#957fb8", green: "#98bb6c", red: "#e46876", subtext0: "#8b8b8b" },
  });
  await setup.flush();
  return { setup, ui, calls, copies, store, get closed() { return closed; } };
}

describe("OpenTUI popup", () => {
  test("background context preserves drafts and collection selection while target actions wait for agents", async () => {
    const payload: Payload = { text: "selection", agents_pending: true, source: { pane_id: "p1" } };
    const app = await create(payload);
    expect(app.setup.captureCharFrame()).toContain("loading agents");
    await app.setup.mockInput.typeText("draft feedback");
    await app.setup.flush();
    expect(app.ui.insertButton.enabled).toBe(false);
    expect(app.ui.chooseButton.enabled).toBe(false);
    expect(app.ui.copyButton.enabled).toBe(true);
    expect(app.ui.collectButton.enabled).toBe(true);
    app.ui.collect();
    app.setup.mockInput.pressKey(" "); await app.setup.flush();
    const checked = [...app.ui.collection.checked];
    app.ui.updatePayload({ agents: [agent("p1")], agents_pending: false, context: [["process", "nvim"]] });
    await app.setup.flush();
    expect(app.ui.tab).toBe("collection");
    expect([...app.ui.collection.checked]).toEqual(checked);
    expect(app.ui.editor.plainText).toBe("draft feedback");
    expect(app.ui.target?.pane_id).toBe("p1");
    expect(app.ui.insertButton.enabled).toBe(true);
    expect(app.store.list()[0]?.context).toBeUndefined();
    app.ui.switchTab("comment"); await app.setup.flush();
    expect(app.setup.captureCharFrame()).toContain("nvim");
  });
  test("late metadata never replaces a recipient chosen by the user, and closed popups ignore updates", async () => {
    const payload: Payload = { text: "selection", agents: [agent("p1"), agent("p2")], source: { pane_id: "p1" } };
    const app = await create(payload);
    await app.ui.choose();
    app.setup.mockInput.pressKey("2"); await app.setup.flush();
    expect(app.ui.target?.pane_id).toBe("p2");
    app.ui.updatePayload({ origin: { pane_id: "p1", tab_id: "t1" }, context: [["branch", "main"]] });
    expect(app.ui.target?.pane_id).toBe("p2");
    app.ui.close();
    app.ui.updatePayload({ context: [["branch", "wrong"]] });
    expect(payload.context).toEqual([["branch", "main"]]);
  });
  test("yank freezes the context at action time while background metadata continues to arrive", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const app = await create({ text: "selection", agents_pending: true, context: [["source", "Herdr"]] }, false, collectionStore(), [], () => gate);
    await app.setup.mockInput.typeText("feedback");
    const copying = app.ui.copyResult();
    app.ui.updatePayload({ context: [["source", "Herdr"], ["file", "late.ts:1"]], agents: [agent("p1")], agents_pending: false });
    release(); await copying;
    expect(app.copies[0]).toContain("source: Herdr");
    expect(app.copies[0]).not.toContain("late.ts");
    expect(app.ui.target?.pane_id).toBe("p1");
    expect(app.ui.insertButton.enabled).toBe(true);
    await app.ui.copyResult();
    expect(app.copies[1]).toContain("file: late.ts:1");
  });
  test("renders selection, destination, and controls in the Herdr popup size", async () => {
    const app = await create();
    const frame = app.setup.captureCharFrame();
    expect(frame).toContain("to p1");
    expect(frame).toContain("selected 한글");
    expect(frame).toContain("^S send");
    expect(frame).toContain("^E submit");
    expect(frame).toContain("^Y yank");
  });
  test("tabs use active underlines, the switch is a button, and compact source details retain provenance in copied output", async () => {
    const app = await create({ text: "selection", agents: [agent("p1")], context: [
      ["source", "Herdr (terminal workspace manager for AI agents) / Comment on Copy"],
      ["capture", "Selected/copied terminal text and available Herdr pane metadata"],
      ["workspace", "dotfiles"], ["process", "codex"], ["cwd", "~/dotfiles"], ["branch", "master"],
    ] });
    const frame = app.setup.captureCharFrame();
    expect(frame).not.toContain("[ Comment ]");
    expect(frame).toContain("[ Tab switch ]");
    expect(frame).toContain("dotfiles · codex · master");
    expect(frame).not.toContain("Herdr");
    expect(frame).not.toContain("comment  to");
    expect(frame).toContain("Type a comment, then choose an action.");
    expect(app.ui.commentTab.attributes & TextAttributes.UNDERLINE).toBeGreaterThan(0);
    await app.setup.mockInput.typeText("feedback");
    app.setup.mockInput.pressKey("y", { ctrl: true });
    await app.setup.waitFor(() => app.copies.length === 1 && !app.ui.busy);
    expect(app.copies[0]).toContain("source: Herdr");
    expect(app.copies[0]).toContain("cwd: ~/dotfiles");
    expect(app.copies[0]).toContain("<comment>\nfeedback\n</comment>");
    await app.setup.mockMouse.click(app.ui.tabSwitch.x + 2, app.ui.tabSwitch.y);
    await app.setup.flush();
    expect(app.ui.tab).toBe("collection");
    expect(app.ui.collectionTab.attributes & TextAttributes.UNDERLINE).toBeGreaterThan(0);
    expect(app.ui.commentTab.attributes & TextAttributes.UNDERLINE).toBe(0);
  });
  test("Korean and emoji editing preserves characters and multiline paste", async () => {
    const app = await create();
    await app.setup.mockInput.pasteBracketedText("한글🙂\nsecond line");
    expect(app.ui.editor.plainText).toBe("한글🙂\nsecond line");
    app.setup.mockInput.pressArrow("left");
    app.setup.mockInput.pressBackspace();
    await app.setup.flush();
    expect(app.ui.editor.plainText).toBe("한글🙂\nsecond lie");
    app.setup.mockInput.pressKey("s", { ctrl: true });
    await app.setup.waitFor(() => app.closed);
    expect(app.calls[0]?.method).toBe("pane.send_input");
    expect(app.calls[0]?.params.text).toContain("한글🙂\nsecond lie");
  });
  test("Ctrl+Y copies without closing; Ctrl+E submits", async () => {
    const app = await create();
    await app.setup.mockInput.typeText("comment");
    app.setup.mockInput.pressKey("y", { ctrl: true });
    await app.setup.waitFor(() => app.copies.length === 1);
    expect(app.closed).toBe(false);
    expect(app.ui.editor.plainText).toBe("comment");
    await app.setup.waitFor(() => !app.ui.busy);
    app.setup.mockInput.pressKey("e", { ctrl: true });
    await app.setup.waitFor(() => app.closed);
    expect(app.calls[0]?.method).toBe("agent.prompt");
  });
  test("approval rejection is shown and preserves the editor", async () => {
    const app = await create(undefined, true);
    await app.setup.mockInput.typeText("comment");
    app.setup.mockInput.pressKey("e", { ctrl: true });
    await app.setup.waitFor(() => app.calls.length === 1 && !app.ui.busy);
    await app.setup.flush();
    expect(app.closed).toBe(false);
    expect(app.setup.captureCharFrame()).toContain("approval pending");
    expect(app.ui.editor.plainText).toBe("comment");
  });
  test("Ctrl+L picks an agent; Escape cancels the picker before closing", async () => {
    const app = await create({ text: "selection", agents: [agent("p1"), agent("p2")] });
    expect(app.ui.target).toBeNull();
    app.setup.mockInput.pressKey("l", { ctrl: true });
    await app.setup.flush();
    expect(app.ui.picking).toBe(true);
    app.setup.mockInput.pressEscape();
    await waitUntil(() => !app.ui.picking);
    await app.setup.flush();
    expect(app.ui.picking).toBe(false);
    expect(app.closed).toBe(false);
    app.setup.mockInput.pressKey("l", { ctrl: true });
    app.setup.mockInput.pressArrow("down");
    app.setup.mockInput.pressEnter();
    await app.setup.flush();
    expect(app.ui.target?.pane_id).toBe("p2");
    expect(app.ui.picking).toBe(false);
    app.setup.mockInput.pressEscape();
    await waitUntil(() => app.closed);
    await app.setup.flush();
    expect(app.closed).toBe(true);
  });
  test("PageDown and mouse wheel scroll the copied selection", async () => {
    const app = await create({ text: Array.from({ length: 40 }, (_, n) => `line ${n}`).join("\n"), agents: [] });
    app.setup.mockInput.pressKey("\x1b[6~");
    await app.setup.flush();
    const before = app.ui.selection.scrollTop;
    expect(before).toBeGreaterThan(0);
    await app.setup.mockMouse.scroll(app.ui.selection.x + 2, app.ui.selection.y + 2, "down");
    await app.setup.flush();
    expect(app.ui.selection.scrollTop).toBeGreaterThan(before);
  });
  test("mouse Ctrl+click on insertion submits immediately", async () => {
    const app = await create();
    await app.setup.mockInput.typeText("comment");
    await app.setup.mockMouse.click(app.ui.insertButton.x + 2, app.ui.insertButton.y, 0, { modifiers: { ctrl: true } });
    await app.setup.waitFor(() => app.closed);
    expect(app.calls[0]?.method).toBe("agent.prompt");
  });
  test("resizing keeps editing and controls available", async () => {
    const app = await create();
    app.setup.resize(60, 16);
    await app.setup.flush();
    await app.setup.mockInput.typeText("resized");
    expect(app.ui.editor.plainText).toBe("resized");
    expect(app.setup.captureCharFrame()).toContain("^S send");
  });
  test("mouse can choose a target after the agent list has scrolled", async () => {
    const app = await create({ text: "selection", agents: Array.from({ length: 20 }, (_, n) => agent(`p${n}`)) });
    app.ui.choose();
    await app.setup.flush();
    for (let n = 0; n < 12; n++) {
      app.setup.mockInput.pressArrow("down");
      await app.setup.flush();
    }
    const row = app.ui.picker.getRenderable("agent-12")!;
    expect(row.y).toBeGreaterThanOrEqual(app.ui.picker.y);
    expect(row.y).toBeLessThan(app.ui.picker.y + app.ui.picker.height);
    await app.setup.mockMouse.click(row.x + 3, row.y);
    await app.setup.flush();
    expect(app.ui.target?.pane_id).toBe("p12");
    expect(app.ui.picking).toBe(false);
  });
  test("long multiline comments scroll while retaining the cursor", async () => {
    const app = await create();
    const text = Array.from({ length: 30 }, (_, n) => `한글 comment ${n}`).join("\n");
    await app.setup.mockInput.pasteBracketedText(text);
    await app.setup.flush();
    expect(app.ui.editor.plainText).toBe(text);
    expect(app.ui.editor.scrollY).toBeGreaterThan(0);
    expect(app.ui.editor.logicalCursor.row).toBe(29);
  });
});

function expectButton(button: ActionButton, enabled: boolean, color = "#ffffff") {
  expect(button.enabled).toBe(enabled);
  expect(button.fg.equals(RGBA.fromHex(enabled ? color : "#8b8b8b"))).toBe(true);
}

describe("shared action availability", () => {
  test("blank comments disable all message buttons, clicks, and shortcuts; editing updates colors immediately", async () => {
    const app = await create();
    const buttons = [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.collectButton];
    for (const comment of ["", " \n\t"]) {
      app.ui.editor.setText(comment); await app.setup.flush();
      for (const button of buttons) {
        expectButton(button, false);
        await app.setup.mockMouse.click(button.x + 2, button.y);
      }
      for (const key of ["s", "e", "y", "k"]) app.setup.mockInput.pressKey(key, { ctrl: true });
      await app.setup.flush();
      expect(app.calls).toEqual([]); expect(app.copies).toEqual([]); expect(app.store.list()).toEqual([]);
      expect(app.ui.tab).toBe("comment"); expect(app.closed).toBe(false);
    }
    for (const button of [app.ui.chooseButton, app.ui.tabSwitch, app.ui.closeButton]) expectButton(button, true);
    app.ui.editor.setText("");
    await app.setup.mockInput.pasteBracketedText("feedback 한글"); await app.setup.flush();
    expectButton(app.ui.insertButton, true);
    expectButton(app.ui.sendButton, true, "#957fb8");
    expectButton(app.ui.copyButton, true);
    expectButton(app.ui.collectButton, true, "#98bb6c");
    app.ui.editor.setText(""); await app.setup.flush();
    for (const button of buttons) expectButton(button, false);
  });
  test("message actions also need selection text, while agent choice and tab switching remain available", async () => {
    const app = await create({ text: " \n", agents: [agent("p1")] });
    await app.setup.mockInput.typeText("feedback"); await app.setup.flush();
    for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.collectButton]) expectButton(button, false);
    await app.ui.send(true); await app.ui.copyResult(); app.ui.collect();
    expect(app.calls).toEqual([]); expect(app.copies).toEqual([]); expect(app.store.list()).toEqual([]);
    expectButton(app.ui.chooseButton, true); expectButton(app.ui.tabSwitch, true);
  });
  test("only send and submit require a target; the picker disables actions and choosing a target restores them", async () => {
    const app = await create({ text: "selection", agents: [] }, false, collectionStore(), [agent("new")]);
    await app.setup.mockInput.typeText("feedback"); await app.setup.flush();
    expectButton(app.ui.insertButton, false); expectButton(app.ui.sendButton, false);
    expectButton(app.ui.copyButton, true); expectButton(app.ui.collectButton, true, "#98bb6c");
    await app.ui.choose(); await app.setup.flush();
    expect(app.ui.picking).toBe(true);
    for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.collectButton, app.ui.chooseButton, app.ui.tabSwitch]) expectButton(button, false);
    expectButton(app.ui.closeButton, true);
    app.setup.mockInput.pressKey("y", { ctrl: true }); app.setup.mockInput.pressKey("k", { ctrl: true });
    app.setup.mockInput.pressEnter(); await app.setup.flush();
    expect(app.copies).toEqual([]); expect(app.store.list()).toEqual([]);
    expectButton(app.ui.insertButton, true); expectButton(app.ui.sendButton, true, "#957fb8");
  });
  test("collection buttons follow selection, target, and deletion history with the same action colors", async () => {
    const store = collectionStore(); store.add({ text: "selection" }, "feedback");
    const app = await create({ text: "", view: "collection", agents: [agent("p1")] }, false, store);
    for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.deleteButton, app.ui.undoButton]) expectButton(button, false);
    expectButton(app.ui.collection.checkButton, true); expectButton(app.ui.collection.allButton, true);
    app.setup.mockInput.pressKey(" "); await app.setup.flush();
    expectButton(app.ui.insertButton, true); expectButton(app.ui.sendButton, true, "#957fb8");
    expectButton(app.ui.copyButton, true); expectButton(app.ui.deleteButton, true, "#e46876");
    app.setup.mockInput.pressKey("d", { ctrl: true }); await app.setup.flush();
    for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.deleteButton, app.ui.collection.checkButton, app.ui.collection.allButton]) expectButton(button, false);
    expectButton(app.ui.undoButton, true);
    app.setup.mockInput.pressKey("z", { ctrl: true }); await app.setup.flush();
    expectButton(app.ui.undoButton, false); expectButton(app.ui.collection.checkButton, true);
  });
  test("legacy entries without comments remain removable but block a mixed batch until unchecked", async () => {
    const store = collectionStore(); const first = store.add({ text: "old selection" }, "feedback");
    const second = store.add({ text: "new selection" }, "new feedback");
    writeFileSync(store.file, JSON.stringify({ version: 1, items: [{ ...first, comment: " " }, second] }));
    const app = await create({ text: "", view: "collection", agents: [agent("p1")] }, false, store);
    app.setup.mockInput.pressKey("a", { ctrl: true }); await app.setup.flush();
    for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton]) {
      expectButton(button, false); await app.setup.mockMouse.click(button.x + 2, button.y);
    }
    for (const key of ["s", "e", "y"]) app.setup.mockInput.pressKey(key, { ctrl: true });
    await app.setup.flush();
    expect(app.calls).toEqual([]); expect(app.copies).toEqual([]); expect(store.list()).toHaveLength(2);
    expectButton(app.ui.deleteButton, true, "#e46876");
    app.setup.mockInput.pressKey(" "); await app.setup.flush();
    expectButton(app.ui.insertButton, true); expectButton(app.ui.sendButton, true, "#957fb8"); expectButton(app.ui.copyButton, true);
  });
  test("pending actions turn controls gray and prevent duplicate requests while leaving Close available", async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const store = collectionStore(); store.add({ text: "selection" }, "feedback");
    const app = await create({ text: "", view: "collection", agents: [agent("p1")] }, false, store, undefined, () => pending);
    app.setup.mockInput.pressKey("a", { ctrl: true }); app.setup.mockInput.pressKey("y", { ctrl: true });
    await app.setup.flush();
    try {
      expect(app.ui.busy).toBe(true);
      for (const button of [app.ui.insertButton, app.ui.sendButton, app.ui.copyButton, app.ui.chooseButton, app.ui.tabSwitch,
        app.ui.collection.checkButton, app.ui.collection.allButton, app.ui.deleteButton, app.ui.undoButton]) expectButton(button, false);
      expectButton(app.ui.closeButton, true);
      for (const key of ["s", "e", "y", "l", "d", "z"]) app.setup.mockInput.pressKey(key, { ctrl: true });
      await app.setup.mockMouse.click(app.ui.deleteButton.x + 2, app.ui.deleteButton.y);
      expect(app.copies).toHaveLength(1); expect(app.calls).toEqual([]); expect(store.list()).toHaveLength(1);
    } finally { finish(); }
    await app.setup.waitFor(() => !app.ui.busy);
    expectButton(app.ui.copyButton, true); expectButton(app.ui.deleteButton, true, "#e46876");
  });
});

describe("Collection tab", () => {
  test("Ctrl+K saves the full draft, keeps the popup open, focuses the new item without checking it, and survives reopening", async () => {
    const payload: Payload = { text: "selected 한글", agents: [agent("p1")], context: [["process", "codex"]] };
    const app = await create(payload);
    await app.setup.mockInput.typeText("keep the entire comment");
    app.setup.mockInput.pressArrow("left");
    app.setup.mockInput.pressArrow("left");
    app.setup.mockInput.pressKey("k", { ctrl: true });
    await app.setup.flush();
    expect(app.ui.tab).toBe("collection");
    expect(app.closed).toBe(false);
    expect(app.ui.collection.checked.size).toBe(0);
    expect(app.store.list()[0]!.comment).toBe("keep the entire comment");
    expect(app.setup.captureCharFrame()).toContain("Collection · 1");
    expect(app.setup.captureCharFrame()).toContain("Added to Collection");
    expect(app.ui.collection.items[app.ui.collection.index]!.text).toBe(payload.text);
    expect(app.ui.collectButton.visible).toBe(false);
    app.setup.mockInput.pressTab();
    await app.setup.flush();
    expect(app.ui.tab).toBe("comment");
    expect(app.ui.editor.plainText).toBe("keep the entire comment");
    app.setup.renderer.destroy();
    const reopened = await create({ text: "", view: "collection", agents: [agent("p1")] }, false, app.store);
    expect(reopened.ui.tab).toBe("collection");
    expect(reopened.ui.collection.items).toHaveLength(1);
    expect(reopened.setup.captureCharFrame()).toContain("keep the entire comment");
  });
  test("collecting into a long list scrolls the new focused item into view after layout", async () => {
    const store = collectionStore();
    for (let index = 0; index < 20; index++) store.add({ text: `old selection ${index}` }, "feedback");
    const app = await create({ text: "new selection" }, false, store);
    app.setup.resize(60, 16); await app.setup.flush();
    await app.setup.mockInput.typeText("new feedback");
    app.setup.mockInput.pressKey("k", { ctrl: true });
    const id = app.ui.collection.items[app.ui.collection.index]!.id;
    await app.setup.waitFor(() => {
      const row = app.ui.collection.list.getRenderable(`collected-${id}`)!;
      return row.y > app.ui.collection.list.y && row.y + row.height < app.ui.collection.list.y + app.ui.collection.list.height;
    });
    expect(app.ui.collection.checked.size).toBe(0);
    expect(app.ui.collection.list.scrollTop).toBeGreaterThan(0);
    expect(app.setup.captureCharFrame()).toContain("new selection");
  });
  test("save failure keeps the draft and Comment tab intact", async () => {
    const store = collectionStore();
    store.add = () => { throw Error("disk full"); };
    const app = await create(undefined, false, store);
    await app.setup.mockInput.typeText("important draft");
    app.setup.mockInput.pressKey("k", { ctrl: true });
    await app.setup.flush();
    expect(app.ui.tab).toBe("comment");
    expect(app.ui.editor.plainText).toBe("important draft");
    expect(app.setup.captureCharFrame()).toContain("disk full");
  });
  test("multiple selection copies one combined message, preserves entries and tab selection, and does not collect from the list", async () => {
    const store = collectionStore();
    store.add({ text: "first", context: [["workspace", "one"]] }, "first comment");
    store.add({ text: "second", context: [["workspace", "two"]] }, "second comment");
    const app = await create({ text: "unused", view: "collection", agents: [agent("p1")] }, false, store);
    app.setup.mockInput.pressKey("y", { ctrl: true });
    await app.setup.flush();
    expect(app.copies).toEqual([]);
    app.setup.mockInput.pressKey("a", { ctrl: true });
    app.setup.mockInput.pressKey("k", { ctrl: true });
    app.setup.mockInput.pressKey("y", { ctrl: true });
    await app.setup.waitFor(() => app.copies.length === 1 && !app.ui.busy);
    expect(app.copies[0]).toContain("workspace: one");
    expect(app.copies[0]).toContain("workspace: two");
    expect(app.copies[0]).toContain("second comment");
    expect(app.closed).toBe(false);
    expect(store.list()).toHaveLength(2);
    app.ui.switchTab("comment"); app.ui.switchTab("collection");
    expect(app.ui.collection.checked.size).toBe(2);
  });
  for (const [key, method] of [["s", "pane.send_input"], ["e", "agent.prompt"]] as const) {
    test(`batch Ctrl+${key.toUpperCase()} makes one request and preserves saved entries`, async () => {
      const store = collectionStore(); store.add({ text: "first" }, "feedback"); store.add({ text: "second" }, "feedback");
      const app = await create({ text: "", view: "collection", agents: [agent("p1")] }, false, store);
      app.setup.mockInput.pressKey("a", { ctrl: true });
      app.setup.mockInput.pressKey(key, { ctrl: true });
      await app.setup.waitFor(() => app.closed);
      const deliveries = app.calls.filter(call => call.method === method);
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]!.params.text).toContain("first");
      expect(deliveries[0]!.params.text).toContain("second");
      expect(store.list()).toHaveLength(2);
    });
  }
  test("a vanished target blocks delivery and Ctrl+L refreshes agents without losing selected items", async () => {
    const store = collectionStore(); store.add({ text: "first" }, "feedback");
    const app = await create({ text: "", view: "collection", agents: [agent("old")] }, false, store, [agent("new")]);
    app.setup.mockInput.pressKey("a", { ctrl: true });
    app.setup.mockInput.pressKey("e", { ctrl: true });
    await app.setup.waitFor(() => !app.ui.busy);
    expect(app.ui.target).toBeNull();
    expect(app.calls.some(call => call.method === "agent.prompt")).toBe(false);
    app.setup.mockInput.pressKey("l", { ctrl: true });
    await app.setup.waitFor(() => app.ui.picking);
    app.setup.mockInput.pressEnter(); await app.setup.flush();
    expect(app.ui.target?.pane_id).toBe("new");
    expect(app.ui.tab).toBe("collection");
    expect(app.ui.collection.checked.size).toBe(1);
    app.setup.mockInput.pressKey("e", { ctrl: true });
    await app.setup.waitFor(() => app.closed);
    expect(app.calls.find(call => call.method === "agent.prompt")!.params.target).toBe("new");
  });
  test("batch rejection retains the open list and selection, and mouse Collect performs the same save transition", async () => {
    const app = await create(undefined, true);
    await app.setup.mockInput.typeText("keep this");
    await app.setup.mockMouse.click(app.ui.collectButton.x + 2, app.ui.collectButton.y);
    await app.setup.flush();
    expect(app.ui.tab).toBe("collection");
    app.setup.mockInput.pressKey("a", { ctrl: true });
    app.setup.mockInput.pressKey("e", { ctrl: true });
    await app.setup.waitFor(() => app.calls.some(call => call.method === "agent.prompt") && !app.ui.busy);
    await app.setup.flush();
    expect(app.closed).toBe(false);
    expect(app.ui.collection.checked.size).toBe(1);
    expect(app.store.list()).toHaveLength(1);
    expect(app.setup.captureCharFrame()).toContain("approval pending");
  });
  test("Space and mouse select items; bulk deletion and undo persist across reopening", async () => {
    const store = collectionStore(); store.add({ text: "first" }, "feedback"); store.add({ text: "second" }, "feedback");
    const app = await create({ text: "", view: "collection" }, false, store);
    app.setup.mockInput.pressKey(" ");
    await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(1);
    const second = app.ui.collection.list.getRenderable(`collected-${app.ui.collection.items[1]!.id}`)!;
    await app.setup.mockMouse.click(second.x + 2, second.y);
    await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(2);
    app.setup.mockInput.pressKey("d", { ctrl: true }); await app.setup.flush();
    expect(store.list()).toEqual([]);
    expect(app.ui.collection.items).toEqual([]);
    app.setup.mockInput.pressKey("z", { ctrl: true }); await app.setup.flush();
    expect(store.list()).toHaveLength(2);
    expect(app.ui.collection.checked.size).toBe(0);
    expect(new Collection(store.file).list()).toHaveLength(2);
  });
  test("mouse tab switching and collection resizing keep the list, preview and actions visible", async () => {
    const store = collectionStore(); store.add({ text: Array.from({ length: 20 }, (_, n) => `line ${n}`).join("\n") }, "long comment");
    const app = await create(undefined, false, store);
    await app.setup.mockInput.typeText("draft");
    await app.setup.mockMouse.click(app.ui.collectionTab.x + 2, app.ui.collectionTab.y);
    app.setup.resize(60, 16); await app.setup.flush();
    expect(app.ui.tab).toBe("collection");
    expect(app.setup.captureCharFrame()).toContain("^S send");
    expect(app.setup.captureCharFrame()).toContain("^D remove");
    expect(app.setup.captureCharFrame()).toContain("0 selected");
    expect(app.ui.collection.list.height).toBeGreaterThan(0);
    expect(app.ui.collection.preview.height).toBeGreaterThan(0);
    expect(app.ui.collection.preview.x).toBeGreaterThanOrEqual(app.ui.collection.list.x + app.ui.collection.list.width);
    expect(app.ui.collection.list.height).toBe(app.ui.collection.preview.height);
    expect(app.ui.status.y).toBeGreaterThanOrEqual(app.ui.collection.preview.y + app.ui.collection.preview.height);
    expect(app.ui.deleteButton.y).toBeGreaterThan(app.ui.status.y);
    expect(app.ui.closeButton.y).toBeLessThan(16);
    app.setup.mockInput.pressKey("\x1b[6~"); await app.setup.flush();
    expect(app.ui.collection.preview.scrollTop).toBeGreaterThan(0);
    await app.setup.mockMouse.click(app.ui.commentTab.x + 2, app.ui.commentTab.y);
    expect(app.ui.editor.plainText).toBe("draft");
  });
  test("aligned collection panels have the hint and management buttons beneath them", async () => {
    const store = collectionStore();
    store.add({ text: "first selection", context: [["workspace", "dotfiles"], ["process", "codex"]] }, "first feedback");
    store.add({ text: "second selection" }, "second feedback");
    const app = await create({ text: "", view: "collection" }, false, store);
    expect(app.ui.collection.preview.x).toBeGreaterThan(app.ui.collection.list.x);
    expect(app.ui.collection.list.y).toBe(app.ui.collection.preview.y);
    expect(app.ui.collection.list.height).toBe(app.ui.collection.preview.height);
    expect(app.ui.status.y).toBeGreaterThanOrEqual(app.ui.collection.preview.y + app.ui.collection.preview.height);
    expect(app.ui.insertButton.y).toBeGreaterThan(app.ui.status.y);
    expect(app.ui.deleteButton.y).toBeGreaterThan(app.ui.status.y);
    expect(app.ui.undoButton.y).toBeLessThan(20);
    expect(app.setup.captureCharFrame()).toContain("Selection");
    expect(app.setup.captureCharFrame()).toContain("first feedback");
    expect(app.setup.captureCharFrame()).toContain("Browse with j/k, select items, then choose an action.");
    const check = app.ui.collection.controls.getRenderable("check-button")!;
    await app.setup.mockMouse.click(check.x + 2, check.y); await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(1);
    const all = app.ui.collection.controls.getRenderable("check-all-button")!;
    await app.setup.mockMouse.click(all.x + 2, all.y); await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(2);
    await app.setup.mockMouse.click(app.ui.deleteButton.x + 2, app.ui.deleteButton.y); await app.setup.flush();
    expect(store.list()).toEqual([]);
    await app.setup.mockMouse.click(app.ui.undoButton.x + 2, app.ui.undoButton.y); await app.setup.flush();
    expect(store.list()).toHaveLength(2);
  });
  test("j/k moves the collection cursor, Space selects, and Ctrl+D deletes checked items without changing Comment input", async () => {
    const store = collectionStore();
    store.add({ text: "first selection" }, "first comment");
    store.add({ text: "second selection" }, "second comment");
    const app = await create({ text: "", view: "collection" }, false, store);
    app.setup.mockInput.pressKey("j"); await app.setup.flush();
    expect(app.ui.collection.index).toBe(1);
    expect(app.setup.captureCharFrame()).toContain("second comment");
    app.setup.mockInput.pressKey(" "); await app.setup.flush();
    const selected = app.ui.collection.items[1]!.id;
    expect(app.ui.collection.checked.has(selected)).toBe(true);
    app.setup.mockInput.pressKey("k"); await app.setup.flush();
    expect(app.ui.collection.index).toBe(0);
    app.setup.mockInput.pressKey("d", { ctrl: true }); await app.setup.flush();
    expect(store.list().map(item => item.text)).toEqual(["first selection"]);
    app.setup.mockInput.pressKey("z", { ctrl: true }); await app.setup.flush();
    expect(store.list()).toHaveLength(2);
    app.ui.switchTab("comment");
    await app.setup.mockInput.typeText("jk");
    expect(app.ui.editor.plainText).toBe("jk");
  });
});
