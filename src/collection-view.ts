import { BoxRenderable, ScrollBoxRenderable, TextAttributes, TextRenderable, type CliRenderer, type KeyEvent } from "@opentui/core";
import type { CollectionStore } from "./collection.ts";
import { contextSummary } from "./context.ts";
import type { Collected, Payload } from "./types.ts";
import { ActionButton } from "./action-button.ts";

const singleLine = (value: string) => value.replace(/[\x00-\x1f\x7f]/g, " ").trim();

export function mountCollection(renderer: CliRenderer, store: CollectionStore,
  colors: Record<string, string>, changed: (count: number) => void,
  say: (message: string, kind?: "ok" | "warn" | "hint") => void, available: () => boolean) {
  const accent = colors.accent || "#957fb8", text = colors.text || "#cdcdcd", faint = colors.subtext0 || "#8b8b8b";
  let items: Collected[] = [], index = 0, deleted: Collected[] = [], previewId: string | undefined;
  let listWidth = 32;
  let pendingFocus: string | undefined;
  const checked = new Set<string>();
  const rows: { root: BoxRenderable; label: TextRenderable; detail: TextRenderable }[] = [];
  const root = new BoxRenderable(renderer, {
    id: "collection", width: "100%", height: "100%", flexDirection: "row", gap: 1, visible: false,
    renderAfter: () => {
      if (!pendingFocus) return;
      const id = pendingFocus;
      pendingFocus = undefined;
      list.scrollChildIntoView(id);
    },
  });
  const listPane = new BoxRenderable(renderer, {
    id: "collection-list-pane", width: listWidth, height: "100%", flexDirection: "column", flexShrink: 0,
  });
  const list = new ScrollBoxRenderable(renderer, {
    id: "collection-list", width: "100%", flexGrow: 1, minHeight: 3,
    border: true, borderColor: faint, title: "Items", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
    onMouseDown: () => { if (available()) list.focus(); },
  });
  const controls = new BoxRenderable(renderer, {
    id: "collection-controls", width: "100%", height: 1, flexShrink: 0, visible: false,
    flexDirection: "row", flexWrap: "wrap", columnGap: 1, rowGap: 0,
  });
  function button(id: string, label: string, enabled: () => boolean, action: () => void, color?: string) {
    const view = new ActionButton(renderer, {
      id, label, disabledColor: faint, color, enabled: () => available() && enabled(), action,
    });
    controls.add(view);
    return view;
  }
  const checkButton = button("check-button", "[ Space select ]", () => items.length > 0, () => toggle());
  const allButton = button("check-all-button", "[ ^A all ]", () => items.length > 0, toggleAll);
  const deleteButton = button("delete-button", "[ ^D remove ]", () => checked.size > 0, removeSelected, colors.red || "#e46876");
  const undoButton = button("undo-button", "[ ^Z undo ]", () => deleted.length > 0, undo);
  function updateActions() { for (const button of [checkButton, allButton, deleteButton, undoButton]) button.update(); }
  listPane.add(list);
  const preview = new ScrollBoxRenderable(renderer, {
    id: "collection-preview", flexGrow: 1, minWidth: 12, height: "100%",
    border: true, borderColor: faint, title: "Preview", titleColor: faint,
    scrollX: false, scrollY: true,
    verticalScrollbarOptions: { showArrows: false, trackOptions: { foregroundColor: accent } },
  });
  const source = new TextRenderable(renderer, {
    id: "preview-source", content: "", fg: faint, width: "100%", height: 1, flexShrink: 0, wrapMode: "none", truncate: true,
  });
  function caption(id: string, label: string) {
    return new TextRenderable(renderer, {
      id, content: label, fg: accent, attributes: TextAttributes.BOLD, height: 1, width: "100%", flexShrink: 0,
    });
  }
  const selectionTitle = caption("preview-selection-title", "Selection");
  const selectedText = new TextRenderable(renderer, {
    id: "preview-selection", content: "", fg: text, width: "100%", wrapMode: "char", flexShrink: 0,
  });
  const commentTitle = caption("preview-comment-title", "Comment");
  const commentText = new TextRenderable(renderer, {
    id: "preview-comment", content: "", fg: text, width: "100%", wrapMode: "char", flexShrink: 0,
  });
  const collectedAt = new TextRenderable(renderer, {
    id: "preview-collected-at", content: "", fg: faint, width: "100%", wrapMode: "char", flexShrink: 0,
  });
  preview.add(source); preview.add(selectionTitle); preview.add(selectedText);
  preview.add(commentTitle); preview.add(commentText); preview.add(collectedAt);
  root.add(listPane); root.add(preview);

  function update() {
    for (const [position, row] of rows.entries()) {
      const item = items[position]!;
      const context = new Map(item.context || []);
      const time = new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const firstLine = item.text.split("\n").find(line => line.trim()) || item.text;
      row.label.content = `${checked.has(item.id) ? "[x]" : "[ ]"} ${singleLine(firstLine)}`;
      row.label.fg = position === index ? accent : text;
      row.label.attributes = position === index ? TextAttributes.BOLD : TextAttributes.NONE;
      row.detail.content = `  ${[...(listWidth >= 28 ? [context.get("workspace")] : []), context.get("process"), time].filter(Boolean).join(" · ")}`;
      row.root.backgroundColor = position === index ? colors.surface1 || "#282830" : "transparent";
    }
    const item = items[index];
    const summary = contextSummary(item?.context);
    source.content = summary;
    source.visible = !!item && !!summary;
    selectionTitle.visible = commentTitle.visible = commentText.visible = collectedAt.visible = !!item;
    selectedText.content = item ? item.text.replace(/\n+$/, "") + "\n" : "No collected items yet.\nCollect text in the Comment tab.";
    commentText.content = item ? (item.comment || "(no comment)") + "\n" : "";
    collectedAt.content = item ? `Collected ${new Date(item.created_at).toLocaleString()}` : "";
    if (previewId !== item?.id) { previewId = item?.id; preview.scrollTo(0); }
    list.title = `${listWidth >= 28 ? "Items · " : ""}${checked.size} selected`;
    updateActions();
    if (item) pendingFocus = `collected-${item.id}`;
    changed(items.length);
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
  function toggleAll() {
    if (!available()) return;
    if (checked.size === items.length) checked.clear(); else for (const item of items) checked.add(item.id);
    update();
  }
  function refresh(preferred?: string) {
    const next = store.list(); // Keep the current view intact if reading fails.
    const focused = preferred || items[index]?.id;
    items = next;
    for (const id of checked) if (!items.some(item => item.id === id)) checked.delete(id);
    for (const row of rows.splice(0)) { list.remove(row.root); row.root.destroyRecursively(); }
    for (const [position, item] of items.entries()) {
      const row = new BoxRenderable(renderer, {
        id: `collected-${item.id}`, width: "100%", height: 2, flexShrink: 0, flexDirection: "column",
        onMouseDown: event => { if (event.button === 0) toggle(position); },
      });
      const label = new TextRenderable(renderer, {
        id: `collected-label-${item.id}`, content: "", width: "100%", height: 1, flexShrink: 0, wrapMode: "none", truncate: true,
      });
      const detail = new TextRenderable(renderer, {
        id: `collected-detail-${item.id}`, content: "", fg: faint, width: "100%", height: 1, flexShrink: 0, wrapMode: "none", truncate: true,
      });
      row.add(label); row.add(detail); list.add(row);
      rows.push({ root: row, label, detail });
    }
    const found = items.findIndex(item => item.id === focused);
    move(found >= 0 ? found : Math.min(index, items.length - 1));
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
    if (!deleteButton.enabled) return;
    try {
      deleted = store.remove([...checked]);
      refresh();
      say(`Removed ${deleted.length} item${deleted.length === 1 ? "" : "s"}`, "ok");
    } catch (error) { say((error as Error).message, "warn"); }
  }
  function undo() {
    if (!undoButton.enabled) return;
    try {
      store.restore(deleted);
      const count = deleted.length, focus = deleted[0]?.id;
      deleted = []; refresh(focus);
      say(`Restored ${count}`, "ok");
    } catch (error) { say((error as Error).message, "warn"); }
  }
  function resize() {
    listWidth = Math.max(18, Math.min(34, Math.floor((renderer.width - 3) * 0.38)));
    listPane.width = listWidth;
    controls.height = renderer.width - 2 >= 53 ? 1 : 2;
    update();
  }
  function onKey(key: KeyEvent): boolean {
    if (!available()) return false;
    if (!key.ctrl && key.name === "k") move(index - 1);
    else if (!key.ctrl && key.name === "j") move(index + 1);
    else if (key.name === "space" || key.name === " ") checkButton.invoke();
    else if (key.ctrl && key.name === "a") allButton.invoke();
    else if (key.ctrl && key.name === "d") deleteButton.invoke();
    else if (key.ctrl && key.name === "z") undoButton.invoke();
    else if (key.name === "pageup") preview.scrollBy(-3);
    else if (key.name === "pagedown") preview.scrollBy(3);
    else return false;
    return true;
  }
  return { root, list, listPane, preview, controls, checkButton, allButton, deleteButton, undoButton, updateActions, checked, refresh, resize, collect, removeSelected, undo, onKey,
    focus: () => list.focus(), selected: () => items.filter(item => checked.has(item.id)),
    get items() { return items; }, get index() { return index; } };
}
