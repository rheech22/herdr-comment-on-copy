import { afterEach, describe, expect, test } from "bun:test";
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing";
import { mountNote } from "../src/note.ts";
import { agent, fakeApi } from "./helpers.ts";
import type { Payload } from "../src/types.ts";

let setup: TestRendererSetup | undefined;
afterEach(() => { setup?.renderer.destroy(); setup = undefined; });
async function waitUntil(predicate: () => boolean) {
  for (let i = 0; i < 200 && !predicate(); i++) await Bun.sleep(10);
  expect(predicate()).toBe(true);
}
async function create(payload: Payload = { text: "selected 한글", agents: [agent("p1")] }, rejected = false) {
  setup = await createTestRenderer({ width: 88, height: 20, autoFocus: false, useMouse: true, consoleMode: "disabled" });
  const calls: { method: string; params: Record<string, unknown> }[] = [];
  const copies: string[] = [];
  let closed = false;
  const ui = mountNote(setup.renderer, payload, {
    api: fakeApi((method, params) => {
      calls.push({ method, params });
      return rejected ? { error: { message: "approval pending" } } : { result: {} };
    }), copy: async text => { copies.push(text); }, close: () => { closed = true; }, closeDelay: 0,
  });
  await setup.flush();
  return { setup, ui, calls, copies, get closed() { return closed; } };
}

describe("OpenTUI popup", () => {
  test("renders selection, destination, and controls in the Herdr popup size", async () => {
    const app = await create();
    const frame = app.setup.captureCharFrame();
    expect(frame).toContain("comment  to  p1");
    expect(frame).toContain("selected 한글");
    expect(frame).toContain("^S insert");
    expect(frame).toContain("^E send");
    expect(frame).toContain("^Y copy");
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
