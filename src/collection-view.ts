import { BoxRenderable, ScrollBoxRenderable, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";
import type { CollectionStore } from "./collection.ts";
import type { Collected, Payload } from "./types.ts";

const singleLine = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, " ").trim();

export function mountCollection(renderer: CliRenderer, store: CollectionStore,
  colors: Record<string, string>, changed: (count: number) => void,
  say: (message: string, kind?: "ok" | "warn" | "hint") => void, available: () => boolean) {
  const accent = colors.accent || "#957fb8", text = colors.text || "#cdcdcd", faint = colors.subtext0 || "#8b8b8b";
  let items: Collected[] = [], index = 0, deleted: Collected[] = [];
  let previewContent = "";
  const checked = new Set<string>();
  const root = new BoxRenderable(renderer, {
    id: "collection", width: "100%", height: "100%", flexDirection: "column", visible: false,
  });
  const hint = new TextRenderable(renderer, {
    id: "collection-hint", content: "Space select · Ctrl+A all · Delete remove · Ctrl+Z undo", fg: faint,
    height: 1, flexShrink: 0, wrapMode: "none",
  });
  const list = new ScrollBoxRenderable(renderer, {
    id: "collection-list", width: "100%", height: 6, minHeight: 2, flexShrink: 0,
    border: true, borderColor: faint, title: "collected", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
    onMouseDown: () => { if (available()) list.focus(); },
  });
  const preview = new ScrollBoxRenderable(renderer, {
    id: "collection-preview", width: "100%", flexGrow: 1, minHeight: 3,
    border: true, borderColor: faint, title: "preview", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  const previewText = new TextRenderable(renderer, {
    id: "collection-preview-text", content: "No collected items yet.", fg: text,
    width: "100%", wrapMode: "char", flexShrink: 0,
  });
  preview.add(previewText);
  root.add(hint); root.add(list); root.add(preview);

  function update() {
    for (const row of list.getChildren()) {
      const position = items.findIndex(item => `collected-${item.id}` === row.id);
      const item = items[position];
      if (!item || !(row instanceof TextRenderable)) continue;
      const context = new Map(item.context || []);
      const detail = [context.get("workspace"), context.get("process"), new Date(item.created_at).toLocaleTimeString()].filter(Boolean).join(" · ");
      row.content = `${checked.has(item.id) ? "[x]" : "[ ]"} ${singleLine(item.text).slice(0, 55)}\n    ${singleLine(item.comment || "(no comment)").slice(0, 45)} · ${singleLine(detail)}`;
      row.fg = position === index ? accent : text;
      row.bg = position === index ? colors.surface1 || "#282830" : "transparent";
    }
    const item = items[index];
    const metadata = item ? (item.context || []).filter(([key]) => !["source", "capture", "selection"].includes(key))
      .map(([key, value]) => `${key}: ${value}`).join("\n") : "";
    const next = item ? `${item.text.replace(/\n+$/, "")}\n\nComment:\n${item.comment || "(no comment)"}\n\n${metadata}\n${item.captured_at ? `captured_at: ${item.captured_at}\n` : ""}collected_at: ${item.created_at}`
      : "No collected items yet. Use Ctrl+K in the Comment tab.";
    if (previewContent !== next) { previewContent = next; previewText.content = next; preview.scrollTo(0); }
    list.title = `collected · ${checked.size} selected`;
    if (item) list.scrollChildIntoView(`collected-${item.id}`);
  }
  function move(next: number) {
    index = Math.max(0, Math.min(items.length - 1, next));
    update();
  }
  function toggle(position = index) {
    if (!available()) return;
    const item = items[position];
    if (!item) return;
    if (checked.has(item.id)) checked.delete(item.id); else checked.add(item.id);
    move(position); list.focus();
  }
  function refresh(preferred?: string) {
    const next = store.list(); // Keep the current view intact if reading fails.
    const focused = preferred || items[index]?.id;
    items = next;
    for (const id of checked) if (!items.some(item => item.id === id)) checked.delete(id);
    for (const row of list.getChildren()) { list.remove(row); row.destroy(); }
    for (const [position, item] of items.entries()) {
      list.add(new TextRenderable(renderer, {
        id: `collected-${item.id}`, content: "", width: "100%", height: 2, flexShrink: 0, wrapMode: "none",
        onMouseDown: event => { if (event.button === 0) toggle(position); },
      }));
    }
    const found = items.findIndex(item => item.id === focused);
    move(found >= 0 ? found : Math.min(index, items.length - 1));
    changed(items.length);
  }
  function collect(payload: Payload, comment: string): boolean {
    try {
      const item = store.add(payload, comment);
      refresh(item.id);
      say("Added to Collection", "ok");
      return true;
    } catch (error) { say((error as Error).message, "warn"); return false; }
  }
  function removeSelected() {
    if (!available()) return;
    if (!checked.size) { say("select items with Space first", "warn"); return; }
    try {
      deleted = store.remove([...checked]);
      refresh();
      say(`Removed ${deleted.length} · Ctrl+Z to undo`, "ok");
    } catch (error) { say((error as Error).message, "warn"); }
  }
  function undo() {
    if (!available() || !deleted.length) return;
    try {
      store.restore(deleted);
      const count = deleted.length, focus = deleted[0]?.id;
      deleted = []; refresh(focus);
      say(`Restored ${count}`, "ok");
    } catch (error) { say((error as Error).message, "warn"); }
  }
  function onKey(key: KeyEvent): boolean {
    if (!available()) return false;
    if (key.name === "up") move(index - 1);
    else if (key.name === "down") move(index + 1);
    else if (key.name === "space" || key.name === " ") toggle();
    else if (key.ctrl && key.name === "a") {
      if (checked.size === items.length) checked.clear(); else for (const item of items) checked.add(item.id);
      update();
    } else if (key.name === "delete") removeSelected();
    else if (key.ctrl && key.name === "z") undo();
    else if (key.name === "pageup") preview.scrollBy(-3);
    else if (key.name === "pagedown") preview.scrollBy(3);
    else return false;
    return true;
  }
  return { root, list, preview, checked, refresh, collect, removeSelected, undo, onKey,
    focus: () => list.focus(), selected: () => items.filter(item => checked.has(item.id)),
    get items() { return items; }, get index() { return index; } };
}
