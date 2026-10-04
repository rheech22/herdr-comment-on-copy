import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { TextAttributes } from "@opentui/core";
import { mountNote } from "../src/note.ts";
import { agent, fakeApi } from "./helpers.ts";
import type { Payload } from "../src/types.ts";
import { Collection, type CollectionStore } from "../src/collection.ts";
import { mkdtempSync, rmSync } from "node:fs";
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
  store: CollectionStore = collectionStore(), currentAgents = payload.agents || []) {
  setup = await createTestRenderer({ width: 88, height: 20, autoFocus: false, useMouse: true, consoleMode: "disabled" });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const copies: string[] = [];
  let closed = false;
  const ui = mountNote(setup.renderer, payload, {
    api: fakeApi((method, params) => {
      calls.push({ method, params });
      if (method === "agent.list") return { result: { agents: currentAgents } };
      return rejected ? { error: { message: "approval pending" } } : { result: {} };
    }), copy: async text => { copies.push(text); }, close: () => { closed = true; }, closeDelay: 0, collection: store,
  });
  await setup.flush();
  return { setup, ui, calls, copies, store, get closed() { return closed; } };
}

describe("OpenTUI popup", () => {
  test("renders selection, destination, and controls in the Herdr popup size", async () => {
    const app = await create();
    const frame = app.setup.captureCharFrame();
    expect(frame).toContain("to p1");
    expect(frame).toContain("selected 한글");
    expect(frame).toContain("^S insert");
    expect(frame).toContain("^E send");
    expect(frame).toContain("^Y copy");
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
    expect(app.setup.captureCharFrame()).toContain("^S insert");
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
  test("blank comments can be collected, and an empty selection cannot", async () => {
    const app = await create();
    app.ui.collect(); await app.setup.flush();
    expect(app.store.list()[0]!.comment).toBe("");
    app.setup.renderer.destroy();
    const empty = await create({ text: "", view: "collection" });
    empty.ui.switchTab("comment"); empty.ui.collect();
    await empty.setup.flush();
    expect(empty.ui.tab).toBe("comment");
    expect(empty.store.list()).toEqual([]);
    expect(empty.setup.captureCharFrame()).toContain("Select or copy text");
  });
  test("collecting into a long list scrolls the new focused item into view after layout", async () => {
    const store = collectionStore();
    for (let index = 0; index < 20; index++) store.add({ text: `old selection ${index}` }, "");
    const app = await create({ text: "new selection" }, false, store);
    app.setup.resize(60, 16); await app.setup.flush();
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
      const store = collectionStore(); store.add({ text: "first" }, ""); store.add({ text: "second" }, "");
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
    const store = collectionStore(); store.add({ text: "first" }, "");
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
    const store = collectionStore(); store.add({ text: "first" }, ""); store.add({ text: "second" }, "");
    const app = await create({ text: "", view: "collection" }, false, store);
    app.setup.mockInput.pressKey(" ");
    await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(1);
    const second = app.ui.collection.list.getRenderable(`collected-${app.ui.collection.items[1]!.id}`)!;
    await app.setup.mockMouse.click(second.x + 2, second.y);
    await app.setup.flush();
    expect(app.ui.collection.checked.size).toBe(2);
    app.setup.mockInput.pressKey("\x1b[3~"); await app.setup.flush();
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
    expect(app.setup.captureCharFrame()).toContain("^S insert");
    expect(app.setup.captureCharFrame()).toContain("Del remove");
    expect(app.setup.captureCharFrame()).toContain("0 selected");
    expect(app.ui.collection.list.height).toBeGreaterThan(0);
    expect(app.ui.collection.preview.height).toBeGreaterThan(0);
    expect(app.ui.collection.preview.x).toBeGreaterThanOrEqual(app.ui.collection.list.x + app.ui.collection.list.width);
    expect(app.ui.deleteButton.x).toBeLessThan(app.ui.collection.preview.x);
    expect(app.ui.closeButton.y).toBeLessThan(16);
    app.setup.mockInput.pressKey("\x1b[6~"); await app.setup.flush();
    expect(app.ui.collection.preview.scrollTop).toBeGreaterThan(0);
    await app.setup.mockMouse.click(app.ui.commentTab.x + 2, app.ui.commentTab.y);
    expect(app.ui.editor.plainText).toBe("draft");
  });
  test("collection management buttons operate on the left while the preview and common actions stay visible", async () => {
    const store = collectionStore();
    store.add({ text: "first selection", context: [["workspace", "dotfiles"], ["process", "codex"]] }, "first feedback");
    store.add({ text: "second selection" }, "second feedback");
    const app = await create({ text: "", view: "collection" }, false, store);
    expect(app.ui.collection.preview.x).toBeGreaterThan(app.ui.collection.list.x);
    expect(app.setup.captureCharFrame()).toContain("Selection");
    expect(app.setup.captureCharFrame()).toContain("first feedback");
    expect(app.setup.captureCharFrame()).toContain("Select items, then choose an action.");
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
});
