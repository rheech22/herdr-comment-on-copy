import {
  BoxRenderable, CliRenderEvents, createCliRenderer, ScrollBoxRenderable,
  TextareaRenderable, TextRenderable,
  type CliRenderer, type KeyEvent, type MouseEvent,
} from "@opentui/core";
import { readFileSync, writeFileSync } from "node:fs";
import { compose, deliver, pickTarget } from "./model.ts";
import { Herdr } from "./herdr.ts";
import { theme } from "./context.ts";
import { ensureState, paths, remove } from "./paths.ts";
import { writeClipboard, closeDesktop } from "./platform.ts";
import type { Agent, Payload } from "./types.ts";

interface NoteOptions {
  api?: Herdr;
  copy?: (text: string) => Promise<void>;
  close?: () => void;
  closeDelay?: number;
  colors?: Record<string, string>;
}

/** UI construction is shared by the real terminal and OpenTUI's test renderer. */
export function mountNote(renderer: CliRenderer, payload: Payload, options: NoteOptions = {}) {
  const colors = options.colors || theme();
  const accent = colors.accent || "#957fb8";
  const faint = colors.subtext0 || "#8b8b8b";
  const text = colors.text || "#cdcdcd";
  const green = colors.green || "#98bb6c";
  const yellow = colors.yellow || "#e6c384";
  const api = options.api || new Herdr();
  const copy = options.copy || writeClipboard;
  const agents = payload.agents || [];
  let target = pickTarget(payload);
  let picking = false;
  let busy = false;
  let closed = false;
  let pickerIndex = 0;

  const root = new BoxRenderable(renderer, {
    id: "note", width: "100%", height: "100%", flexDirection: "column", paddingX: 1,
  });
  const header = new BoxRenderable(renderer, { id: "header", flexDirection: "row", height: 1, flexShrink: 0, gap: 2 });
  const destination = new TextRenderable(renderer, { id: "destination", content: "", fg: accent, flexShrink: 1 });
  const chooseButton = new TextRenderable(renderer, {
    id: "choose-button", content: "[ ^L change ]", fg: faint, height: 1,
    onMouseDown: event => { if (event.button === 0) choose(); },
  });
  header.add(destination);
  if (agents.length) header.add(chooseButton);
  root.add(header);
  const context = new TextRenderable(renderer, {
    id: "context", content: (payload.context || []).filter(([key]) => key !== "title").map(([, value]) => value).join("  ·  "),
    fg: faint, height: 1, flexShrink: 0, wrapMode: "none",
  });
  root.add(context);
  const selection = new ScrollBoxRenderable(renderer, {
    id: "selection", width: "100%", height: Math.min(7, Math.max(4, renderer.height - 13)),
    flexShrink: 0, border: true, borderColor: faint, title: "selected", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  selection.add(new TextRenderable(renderer, {
    id: "selected-text", content: payload.text.replace(/\n+$/, ""), fg: text, width: "100%", wrapMode: "char", flexShrink: 0,
  }));
  root.add(selection);
  const commentBox = new BoxRenderable(renderer, {
    id: "comment-box", width: "100%", flexGrow: 1, minHeight: 4, border: true,
    borderColor: faint, title: "comment", titleColor: faint, flexDirection: "column",
  });
  const editor = new TextareaRenderable(renderer, {
    id: "comment-editor", width: "100%", flexGrow: 1, minHeight: 1, wrapMode: "char",
    textColor: text, focusedTextColor: text, cursorColor: accent,
    placeholder: "Type a comment…", placeholderColor: faint,
    onMouseDown: () => { if (!picking) editor.focus(); },
  });
  const picker = new ScrollBoxRenderable(renderer, {
    id: "agent-picker", width: "100%", flexGrow: 1, visible: false,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  const agentRows = agents.map((agent, index) => {
    const row = new TextRenderable(renderer, {
      id: `agent-${index}`, content: `${index + 1}. ${agent.name}`, fg: text,
      height: 1, width: "100%", flexShrink: 0, wrapMode: "none",
      onMouseDown: event => { if (event.button === 0) selectAgent(index); },
    });
    picker.add(row);
    return row;
  });
  commentBox.add(editor);
  commentBox.add(picker);
  root.add(commentBox);
  const status = new TextRenderable(renderer, {
    id: "status", content: "type a comment, then ^S or ^E", fg: faint, height: 1, flexShrink: 0, wrapMode: "none",
  });
  root.add(status);
  const footer = new BoxRenderable(renderer, { id: "buttons", flexDirection: "row", height: 1, flexShrink: 0, gap: 1 });
  const button = (id: string, label: string, color: string, action: (event: MouseEvent) => void) => {
    const view = new TextRenderable(renderer, { id, content: label, fg: color, height: 1,
      onMouseDown: event => { if (event.button === 0) action(event); } });
    footer.add(view);
    return view;
  };
  const insertButton = button("insert-button", "[ ^S insert ]", faint, event => { void send(event.modifiers.ctrl); });
  const sendButton = button("send-button", "[ ^E send ]", accent, () => { void send(true); });
  const copyButton = button("copy-button", "[ ^Y copy ]", faint, () => { void copyResult(); });
  button("close-button", "[ Esc close ]", faint, close);
  root.add(footer);
  renderer.root.add(root);

  function say(message: string, kind: "ok" | "warn" | "hint" = "hint") {
    if (closed) return;
    status.content = message;
    status.fg = kind === "ok" ? green : kind === "warn" ? yellow : faint;
  }
  function updateTarget() {
    destination.content = `comment  to  ${target?.name || "nowhere"}`;
    chooseButton.content = target ? "[ ^L change ]" : "[ ^L pick ]";
  }
  function leavePicker() {
    picking = false;
    picker.visible = false;
    editor.visible = true;
    commentBox.title = "comment";
    editor.focus();
  }
  function selectAgent(index: number) {
    if (!agents[index] || busy || closed) return;
    target = agents[index]!;
    updateTarget();
    leavePicker();
    say(`target → ${target.name}`);
  }
  function choose() {
    if (busy || closed) return;
    if (!agents.length) { say("no agent panes available", "warn"); return; }
    picking = true;
    editor.visible = false;
    picker.visible = true;
    movePicker(Math.max(0, agents.findIndex(agent => agent.pane_id === target?.pane_id)));
    commentBox.title = "choose a target · Enter selects · Esc cancels";
    picker.focus();
  }
  function movePicker(index: number) {
    pickerIndex = Math.max(0, Math.min(agents.length - 1, index));
    for (const [index, row] of agentRows.entries()) {
      row.fg = index === pickerIndex ? accent : text;
      row.bg = index === pickerIndex ? colors.surface1 || "#282830" : "transparent";
    }
    picker.scrollChildIntoView(`agent-${pickerIndex}`);
  }
  async function send(submit: boolean) {
    if (busy || closed) return;
    busy = true;
    say(submit ? "sending…" : "inserting…");
    const result = await deliver(api, copy, payload, editor.plainText, target, submit);
    say(result.message, result.kind);
    if (result.close) {
      await Bun.sleep(options.closeDelay ?? 700);
      close();
    }
    busy = false;
  }
  async function copyResult() {
    if (busy || closed) return;
    busy = true;
    try { await copy(compose(payload, editor.plainText) + "\n"); say("copied to clipboard", "ok"); }
    catch (error) { say((error as Error).message, "warn"); }
    finally { busy = false; }
  }
  function onKey(key: KeyEvent) {
    if (closed) return;
    let handled = true;
    if (key.name === "escape" || (key.ctrl && ["q", "w"].includes(key.name))) {
      if (picking) leavePicker(); else close();
    } else if (key.ctrl && key.name === "l") choose();
    else if (key.ctrl && key.name === "s") void send(false);
    else if (key.ctrl && key.name === "e") void send(true);
    else if (key.ctrl && key.name === "y") void copyResult();
    else if (picking && key.name === "up") movePicker(pickerIndex - 1);
    else if (picking && key.name === "down") movePicker(pickerIndex + 1);
    else if (picking && key.name === "return") selectAgent(pickerIndex);
    else if (key.name === "pageup") selection.scrollBy(-3);
    else if (key.name === "pagedown") selection.scrollBy(3);
    else if (picking && /^[1-9]$/.test(key.name)) selectAgent(Number(key.name) - 1);
    else handled = false;
    if (handled) { key.preventDefault(); key.stopPropagation(); }
  }
  function onResize() { selection.height = Math.min(7, Math.max(3, renderer.height - 13)); }
  function dispose() {
    renderer.keyInput.off("keypress", onKey);
    renderer.off(CliRenderEvents.RESIZE, onResize);
  }
  function close() {
    if (closed) return;
    closed = true;
    dispose();
    (options.close || (() => renderer.destroy()))();
  }
  renderer.keyInput.on("keypress", onKey);
  renderer.on(CliRenderEvents.RESIZE, onResize);
  renderer.once(CliRenderEvents.DESTROY, () => { closed = true; dispose(); });
  updateTarget();
  editor.focus();
  return { editor, picker, selection, root, status, insertButton, sendButton, copyButton,
    get target(): Agent | null { return target; }, get picking() { return picking; }, get busy() { return busy; },
    close, choose, send, copyResult };
}

export async function main() {
  ensureState();
  let payload: Payload;
  try {
    payload = JSON.parse(readFileSync(paths.payload, "utf8")) as Payload;
    if (typeof payload.text !== "string") throw new Error("Missing selection");
  } catch { payload = { text: "(could not read the copied text)" }; }
  writeFileSync(paths.lock, String(process.pid), { mode: 0o600 });
  const cleanup = () => {
    closeDesktop();
    try { if (readFileSync(paths.lock, "utf8").trim() === String(process.pid)) remove(paths.lock); } catch { /* Already cleaned up. */ }
  };
  try {
    const renderer = await createCliRenderer({
      exitOnCtrlC: true, useMouse: true, autoFocus: false,
      consoleMode: "disabled", openConsoleOnError: false, onDestroy: cleanup,
    });
    try { mountNote(renderer, payload); } catch (error) { renderer.destroy(); throw error; }
  } catch (error) { cleanup(); throw error; }
}
if (import.meta.main) await main();
