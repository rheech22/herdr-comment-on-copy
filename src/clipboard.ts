import { createHash } from "node:crypto";

const terminalNames = /(?:^|[\s._-])(?:wezterm(?:-gui)?|iterm2?|terminal|ghostty|kitty|alacritty|windowsterminal|conhost|mintty|gnome-terminal(?:-server)?|kgx|konsole|foot|xterm|urxvt|rxvt|st|terminator|tilix|rio|hyper|tabby)(?:$|[\s._-])/i;
export const isTerminal = (name: string) => terminalNames.test(name)
  || (process.env.COMMENT_ON_COPY_TERMINALS || "").split(",").some(value => value.trim() && name.toLowerCase() === value.trim().toLowerCase());
const fingerprint = (text: string) => createHash("sha256").update(text).digest("hex");
export type CopyDecision = "unchanged" | "empty" | "popup-result" | "repeat" | "outside-terminal" | "open";

/** Remember recent clipboard values for one watcher run. */
export class ClipboardHistory {
  private recent: string[] = [];
  private previousFront = "";
  constructor(private last: string, private limit = 60) { this.remember(last); }
  private remember(text: string) {
    this.recent.push(fingerprint(text));
    if (this.recent.length > this.limit) this.recent.shift();
  }
  observe(text: string, front: string, popupClosed = false): CopyDecision {
    const before = this.previousFront;
    this.previousFront = front;
    if (popupClosed) {
      this.last = text;
      this.remember(text);
      return "popup-result";
    }
    const unchanged = text === this.last;
    this.last = text;
    if (unchanged) return "unchanged";
    if (!text.trim()) return "empty";
    const repeat = this.recent.includes(fingerprint(text));
    this.remember(text);
    if (repeat) return "repeat";
    return isTerminal(front) && isTerminal(before) ? "open" : "outside-terminal";
  }
}
