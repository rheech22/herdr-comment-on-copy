import {
  BoxRenderable, CliRenderEvents, createCliRenderer, ScrollBoxRenderable,
  TextareaRenderable, TextAttributes, TextRenderable,
  type CliRenderer, type KeyEvent, type MouseEvent,
} from "@opentui/core";
import { readFileSync, writeFileSync } from "node:fs";
import { compose, composeCollection, deliver, deliverText, pickTarget } from "./model.ts";
import { Collection, type CollectionStore } from "./collection.ts";
import { mountCollection } from "./collection-view.ts";
import { Herdr } from "./herdr.ts";
import { contextSummary, theme } from "./context.ts";
import { ensureState, paths, remove } from "./paths.ts";
import { writeClipboard, closeDesktop } from "./platform.ts";
import type { Agent, Payload } from "./types.ts";

interface NoteOptions {
  api?: Herdr;
  copy?: (text: string) => Promise<void>;
  close?: () => void;
  closeDelay?: number;
  colors?: Record<string, string>;
  collection?: CollectionStore;
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
  let agents = payload.agents || [];
  let target = pickTarget(payload);
  let tab = payload.view || "comment";
  let picking = false;
  let busy = false;
  let closed = false;
  let pickerIndex = 0;

  const root = new BoxRenderable(renderer, {
    id: "note", width: "100%", height: "100%", flexDirection: "column", paddingX: 1,
  });
  const tabs = new BoxRenderable(renderer, { id: "tabs", flexDirection: "row", height: 1, flexShrink: 0, gap: 2 });
  const tabNames = new BoxRenderable(renderer, { id: "tab-names", flexDirection: "row", flexGrow: 1, minWidth: 0, height: 1, gap: 2 });
  const commentTab = new TextRenderable(renderer, {
    id: "comment-tab", content: "Comment", fg: accent, height: 1, flexShrink: 0,
    onMouseDown: event => { if (event.button === 0) switchTab("comment"); },
  });
  const collectionTab = new TextRenderable(renderer, {
    id: "collection-tab", content: "Collection · 0", fg: faint, height: 1, wrapMode: "none", truncate: true,
    onMouseDown: event => { if (event.button === 0) switchTab("collection"); },
  });
  tabNames.add(commentTab);
  tabNames.add(new TextRenderable(renderer, { id: "tab-separator", content: "│", fg: faint, height: 1, flexShrink: 0 }));
  tabNames.add(collectionTab);
  const tabSwitch = new TextRenderable(renderer, {
    id: "tab-switch", content: "[ Tab switch ]", fg: faint, height: 1, flexShrink: 0,
    onMouseDown: event => { if (event.button === 0) switchTab(tab === "comment" ? "collection" : "comment"); },
  });
  tabs.add(tabNames); tabs.add(tabSwitch);
  root.add(tabs);
  const header = new BoxRenderable(renderer, { id: "header", flexDirection: "row", height: 1, flexShrink: 0, gap: 2 });
  const destination = new TextRenderable(renderer, { id: "destination", content: "", fg: accent, flexShrink: 1 });
  const chooseButton = new TextRenderable(renderer, {
    id: "choose-button", content: "[ ^L change ]", fg: faint, height: 1,
    onMouseDown: event => { if (event.button === 0) void choose(); },
  });
  header.add(destination);
  header.add(chooseButton);
  root.add(header);
  const body = new BoxRenderable(renderer, { id: "body", flexDirection: "column", flexGrow: 1, minHeight: 0 });
  const commentPane = new BoxRenderable(renderer, {
    id: "comment-pane", width: "100%", height: "100%", flexDirection: "column",
  });
  const context = new TextRenderable(renderer, {
    id: "context", content: contextSummary(payload.context), visible: !!contextSummary(payload.context),
    fg: faint, height: 1, flexShrink: 0, wrapMode: "none", truncate: true,
  });
  commentPane.add(context);
  const selection = new ScrollBoxRenderable(renderer, {
    id: "selection", width: "100%", height: Math.min(7, Math.max(3, renderer.height - 15)),
    flexShrink: 0, border: true, borderColor: faint, title: "Selection", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  selection.add(new TextRenderable(renderer, {
    id: "selected-text", content: payload.text.replace(/\n+$/, "") || "Select or copy terminal text to start a comment.", fg: text, width: "100%", wrapMode: "char", flexShrink: 0,
  }));
  commentPane.add(selection);
  const commentBox = new BoxRenderable(renderer, {
    id: "comment-box", width: "100%", flexGrow: 1, minHeight: 4, border: true,
    borderColor: faint, title: "Comment", titleColor: faint, flexDirection: "column",
  });
  const editor = new TextareaRenderable(renderer, {
    id: "comment-editor", width: "100%", flexGrow: 1, minHeight: 1, wrapMode: "char",
    textColor: text, focusedTextColor: text, cursorColor: accent,
    placeholder: "Add your feedback…", placeholderColor: faint,
    onMouseDown: () => { if (!picking) editor.focus(); },
  });
  const picker = new ScrollBoxRenderable(renderer, {
    id: "agent-picker", width: "100%", flexGrow: 1, visible: false,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  let agentRows: TextRenderable[] = [];
  function populateAgents() {
    for (const row of agentRows) { picker.remove(row); row.destroy(); }
    agentRows = agents.map((agent, index) => {
      const row = new TextRenderable(renderer, {
        id: `agent-${index}`, content: `${index + 1}. ${agent.name}`, fg: text,
        height: 1, width: "100%", flexShrink: 0, wrapMode: "none",
        onMouseDown: event => { if (event.button === 0) selectAgent(index); },
      });
      picker.add(row);
      return row;
    });
  }
  populateAgents();
  const pickerBox = new BoxRenderable(renderer, {
    id: "picker-box", width: "100%", height: "100%", border: true, borderColor: faint,
    title: "choose a target · Enter selects · Esc cancels", titleColor: faint, visible: false,
  });
  pickerBox.add(picker);
  commentBox.add(editor);
  commentPane.add(commentBox);
  body.add(commentPane); body.add(pickerBox);
  root.add(body);
  const status = new TextRenderable(renderer, {
    id: "status", content: tab === "comment" ? "Type a comment, then choose an action." : "Select items, then choose an action.",
    fg: faint, height: 1, flexShrink: 0, wrapMode: "none",
  });
  root.add(status);
  const footer = new BoxRenderable(renderer, { id: "buttons", flexDirection: "row", height: 1, flexShrink: 0, gap: 2 });
  const actions = new BoxRenderable(renderer, {
    id: "actions", flexDirection: "row", flexWrap: "wrap", flexGrow: 1, minWidth: 0, height: "100%", columnGap: 1, rowGap: 0,
  });
  footer.add(actions);
  const button = (id: string, label: string, color: string, action: (event: MouseEvent) => void, parent = actions) => {
    const view = new TextRenderable(renderer, { id, content: label, fg: color, height: 1,
      onMouseDown: event => { if (event.button === 0) action(event); } });
    parent.add(view);
    return view;
  };
  const insertButton = button("insert-button", "[ ^S insert ]", faint, event => { void send(event.modifiers.ctrl); });
  const sendButton = button("send-button", "[ ^E send ]", accent, () => { void send(true); });
  const copyButton = button("copy-button", "[ ^Y copy ]", faint, () => { void copyResult(); });
  const collectButton = button("collect-button", "[ ^K collect ]", green, collect);
  const closeButton = button("close-button", "[ Esc close ]", faint, close, footer);
  root.add(footer);
  renderer.root.add(root);
  const collection = mountCollection(renderer, options.collection || new Collection(), colors,
    count => { collectionTab.content = `Collection · ${count}`; updateActions(); }, say,
    () => !busy && !closed && !picking && tab === "collection");
  body.add(collection.root);
  const { deleteButton, undoButton } = collection;

  function say(message: string, kind: "ok" | "warn" | "hint" = "hint") {
    if (closed) return;
    status.content = message;
    status.fg = kind === "ok" ? green : kind === "warn" ? yellow : faint;
  }
  function updateTarget() {
    destination.content = `to ${target?.name || "—"}`;
    chooseButton.content = target ? "[ ^L change ]" : "[ ^L pick ]";
    updateActions();
  }
  function updateActions() {
    const selected = tab === "comment" || collection.checked.size > 0;
    insertButton.fg = copyButton.fg = selected ? text : faint;
    sendButton.fg = selected && target ? accent : faint;
  }
  function leavePicker() {
    picking = false;
    picker.visible = false;
    pickerBox.visible = false;
    showTab();
  }
  function selectAgent(index: number) {
    if (!agents[index] || busy || closed) return;
    target = agents[index]!;
    updateTarget();
    leavePicker();
    say(`target → ${target.name}`);
  }
  async function choose() {
    if (busy || closed) return;
    if (tab === "collection") {
      busy = true;
      try { agents = await api.agents(); if (closed) return; populateAgents(); }
      finally { busy = false; }
      if (closed) return;
      target = agents.find(agent => agent.pane_id === target?.pane_id) || null;
      updateTarget();
    }
    if (!agents.length) { say("no agent panes available", "warn"); return; }
    picking = true;
    commentPane.visible = false;
    collection.root.visible = false;
    pickerBox.visible = true;
    picker.visible = true;
    movePicker(Math.max(0, agents.findIndex(agent => agent.pane_id === target?.pane_id)));
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
    if (busy || closed || picking) return;
    const selected = tab === "collection" ? collection.selected() : [];
    if (tab === "collection" && !selected.length) { say("Select items, then choose an action.", "warn"); return; }
    busy = true;
    say(submit ? "sending…" : "inserting…");
    try {
      if (tab === "collection") {
        agents = await api.agents();
        if (closed) return;
        target = agents.find(agent => agent.pane_id === target?.pane_id) || null;
        updateTarget();
      }
      const result = tab === "collection"
        ? await deliverText(api, copy, composeCollection(selected), target, submit)
        : await deliver(api, copy, payload, editor.plainText, target, submit);
      say(result.message, result.kind);
      if (result.close) {
        await Bun.sleep(options.closeDelay ?? 700);
        close();
      }
    } catch (error) { say((error as Error).message, "warn"); }
    finally { busy = false; }
  }
  async function copyResult() {
    if (busy || closed || picking) return;
    const selected = tab === "collection" ? collection.selected() : [];
    if (tab === "collection" && !selected.length) { say("Select items, then choose an action.", "warn"); return; }
    busy = true;
    try { await copy((tab === "collection" ? composeCollection(selected) : compose(payload, editor.plainText)) + "\n"); say("copied to clipboard", "ok"); }
    catch (error) { say((error as Error).message, "warn"); }
    finally { busy = false; }
  }
  function showTab() {
    commentPane.visible = tab === "comment";
    collection.root.visible = tab === "collection";
    collectButton.visible = tab === "comment";
    commentTab.fg = tab === "comment" ? accent : faint;
    collectionTab.fg = tab === "collection" ? accent : faint;
    commentTab.attributes = tab === "comment" ? TextAttributes.BOLD | TextAttributes.UNDERLINE : TextAttributes.NONE;
    collectionTab.attributes = tab === "collection" ? TextAttributes.BOLD | TextAttributes.UNDERLINE : TextAttributes.NONE;
    onResize();
    updateTarget();
    if (tab === "comment") editor.focus(); else collection.focus();
  }
  function switchTab(next: "comment" | "collection") {
    if (busy || closed || picking) return;
    try {
      if (next === "collection") collection.refresh();
      tab = next;
      showTab();
      say(tab === "comment" ? "Type a comment, then choose an action." : "Select items, then choose an action.");
    } catch (error) { say((error as Error).message, "warn"); }
  }
  function collect() {
    if (busy || closed || picking || tab !== "comment") return;
    if (collection.collect(payload, editor.plainText)) {
      tab = "collection";
      showTab();
    }
  }
  function onKey(key: KeyEvent) {
    if (closed) return;
    let handled = true;
    if (key.name === "escape" || (key.ctrl && ["q", "w"].includes(key.name))) {
      if (picking) leavePicker(); else close();
    } else if (busy) return;
    else if (key.ctrl && key.name === "l") void choose();
    else if (key.ctrl && key.name === "s") void send(false);
    else if (key.ctrl && key.name === "e") void send(true);
    else if (key.ctrl && key.name === "y") void copyResult();
    else if (!picking && key.ctrl && key.name === "k") collect();
    else if (!picking && key.name === "tab") switchTab(tab === "comment" ? "collection" : "comment");
    else if (picking && key.name === "up") movePicker(pickerIndex - 1);
    else if (picking && key.name === "down") movePicker(pickerIndex + 1);
    else if (picking && key.name === "return") selectAgent(pickerIndex);
    else if (!picking && tab === "collection") handled = collection.onKey(key);
    else if (!picking && key.name === "pageup") selection.scrollBy(-3);
    else if (!picking && key.name === "pagedown") selection.scrollBy(3);
    else if (picking && /^[1-9]$/.test(key.name)) selectAgent(Number(key.name) - 1);
    else handled = false;
    if (handled) { key.preventDefault(); key.stopPropagation(); }
  }
  function onResize() {
    const available = renderer.width - 2 - 15;
    const widths = [13, 11, 11, ...(tab === "comment" ? [14] : [])];
    let rows = 1, used = 0;
    for (const width of widths) {
      if (used && used + 1 + width > available) { rows++; used = 0; }
      used += width + (used ? 1 : 0);
    }
    footer.height = rows;
    selection.height = Math.min(7, Math.max(3, renderer.height - rows - (context.visible ? 1 : 0) - 8));
    tabSwitch.content = renderer.width < 52 ? "[ Tab ]" : "[ Tab switch ]";
    collection.resize();
  }
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
  try { collection.refresh(); } catch (error) { say((error as Error).message, "warn"); }
  onResize();
  showTab();
  return { editor, picker, selection, root, status, insertButton, sendButton, copyButton,
    collection, commentTab, collectionTab, tabSwitch, closeButton, collectButton, deleteButton, undoButton, switchTab, collect,
    get tab() { return tab; },
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
