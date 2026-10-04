import { Herdr } from "./herdr.ts";
import { openNote } from "./capture.ts";
import { readClipboard, closeDesktop } from "./platform.ts";

export async function open() {
  const context = JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || "{}") as {
    selected_text?: string; focused_pane_id?: string;
  };
  try {
    const text = context.selected_text ?? await readClipboard();
    if (!text.trim()) throw new Error("Select or copy terminal text before opening a comment.");
    const source = context.selected_text && context.focused_pane_id ? { pane_id: context.focused_pane_id } : undefined;
    if (!await openNote(new Herdr(), text, source, context.focused_pane_id)) throw new Error("A comment popup is already open.");
  } finally { closeDesktop(); }
}
export async function openCollection() {
  if (!await openNote(new Herdr(), "", null, undefined, "collection")) throw new Error("A comment popup is already open.");
}
if (import.meta.main) await open();
