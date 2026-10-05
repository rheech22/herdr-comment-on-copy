import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { ensureState, paths, remove } from "./paths.ts";

const terminalNames = /(?:^|[\s._-])(?:wezterm(?:-gui)?|iterm2?|terminal|ghostty|kitty|alacritty|windowsterminal|conhost|mintty|gnome-terminal(?:-server)?|kgx|konsole|foot|xterm|urxvt|rxvt|st|terminator|tilix|rio|hyper|tabby)(?:$|[\s._-])/i;
export const isTerminal = (name: string) => terminalNames.test(name)
  || (process.env.COMMENT_ON_COPY_TERMINALS || "").split(",").some(value => value.trim() && name.toLowerCase() === value.trim().toLowerCase());
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
export type CopyDecision = "unchanged" | "empty" | "popup-result" | "outside-terminal" | "open";

/** Suppress only a copy actually produced by this plugin, not the next user's copy. */
export function rememberPopupCopy(text: string, revision?: string) {
  ensureState();
  writeFileSync(paths.clipboardOutput, JSON.stringify({ hash: fingerprint(text), revision, at: Date.now() }), { mode: 0o600 });
}
export function consumePopupCopy(text: string, revision?: string): boolean {
  try {
    const output = JSON.parse(readFileSync(paths.clipboardOutput, "utf8"));
    remove(paths.clipboardOutput);
    return Date.now() - output.at < 10000 && output.hash === fingerprint(text)
      && (output.revision === undefined || revision === undefined || output.revision === revision);
  } catch { return false; }
}

/** Track copies, including same-text writes when the OS supplies a revision. */
export class ClipboardHistory {
  private previousFront = "";
  constructor(private last: string, private revision?: string) {}
  observe(text: string, front: string, revision?: string, popupResult = false): CopyDecision {
    const before = this.previousFront;
    this.previousFront = front;
    const unchanged = text === this.last && (revision === undefined || this.revision === undefined || revision === this.revision);
    this.last = text;
    this.revision = revision;
    if (unchanged) return "unchanged";
    if (popupResult) return "popup-result";
    if (!text.trim()) return "empty";
    return isTerminal(front) && isTerminal(before) ? "open" : "outside-terminal";
  }
}
