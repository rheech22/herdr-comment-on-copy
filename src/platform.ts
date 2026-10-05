import { run, writeCommand } from "./system.ts";
import { WindowsDesktop } from "./windows.ts";
import { DesktopBridge } from "./desktop-bridge.ts";
import { join } from "node:path";
import { rememberPopupCopy } from "./clipboard.ts";

export interface ClipboardSample { front: string; text: string; revision?: string; }

export interface Desktop {
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<string | void>;
  sample(): Promise<ClipboardSample>;
  checkAutomatic(): void;
  close(): void;
}
type Execute = (argv: string[]) => Promise<string>;

export function focusedSway(tree: any): string {
  if (tree.focused) return tree.app_id || tree.window_properties?.class || "";
  for (const child of [...(tree.nodes || []), ...(tree.floating_nodes || [])]) {
    const name = focusedSway(child);
    if (name) return name;
  }
  return "";
}

export function createDesktop(platform = process.platform, env = process.env,
  execute: Execute = run, write = writeCommand, which = (name: string) => Bun.which(name),
  makeBridge = (command: string[]): Pick<DesktopBridge, "request" | "close"> => new DesktopBridge(command)) : Desktop {
  const requireCommand = (name: string) => {
    if (!which(name)) throw new Error(`Missing ${name}. Install it or use comment_on_copy.open for selected text.`);
  };
  let read: string[];
  let copy: string[];
  let front: () => Promise<string>;
  let check: () => void;
  if (platform === "win32") {
    const bridge = new WindowsDesktop();
    return {
      readClipboard: () => bridge.request<string>({ action: "read" }),
      writeClipboard: text => bridge.request<string>({ action: "write", text }),
      sample: () => bridge.request({ action: "sample" }),
      checkAutomatic: () => requireCommand("powershell.exe"),
      close: () => bridge.close(),
    };
  } else if (platform === "darwin") {
    const bridge = makeBridge(["/usr/bin/osascript", "-l", "JavaScript", join(import.meta.dir, "../scripts/macos.js")]);
    return {
      readClipboard: () => bridge.request<string>({ action: "read" }),
      writeClipboard: text => bridge.request<string>({ action: "write", text }),
      sample: () => bridge.request<ClipboardSample>({ action: "sample" }),
      checkAutomatic: () => requireCommand("osascript"),
      close: () => bridge.close(),
    };
  } else if (platform === "linux" && env.WAYLAND_DISPLAY) {
    read = ["wl-paste", "--no-newline", "--type", "text"];
    copy = ["wl-copy", "--type", "text/plain;charset=utf-8"];
    if (env.SWAYSOCK) {
      front = async () => focusedSway(JSON.parse(await execute(["swaymsg", "-t", "get_tree"])));
      check = () => requireCommand("swaymsg");
    } else if (env.HYPRLAND_INSTANCE_SIGNATURE) {
      front = async () => JSON.parse(await execute(["hyprctl", "activewindow", "-j"])).class || "";
      check = () => requireCommand("hyprctl");
    } else {
      front = async () => "";
      check = () => { throw new Error("Automatic capture on this Wayland desktop cannot verify the foreground window. Use comment_on_copy.open instead."); };
    }
    const checkFront = check;
    check = () => { requireCommand("wl-paste"); requireCommand("wl-copy"); checkFront(); };
  } else if (platform === "linux" && env.DISPLAY) {
    read = ["xclip", "-selection", "clipboard", "-out"];
    copy = ["xclip", "-selection", "clipboard", "-in"];
    front = async () => {
      const active = await execute(["xprop", "-root", "_NET_ACTIVE_WINDOW"]);
      const id = active.match(/0x[\da-f]+/i)?.[0];
      if (!id || id === "0x0") return "";
      const info = await execute(["xprop", "-id", id, "WM_CLASS"]);
      return [...info.matchAll(/"([^"]+)"/g)].map(match => match[1]).join(" ");
    };
    check = () => { requireCommand("xclip"); requireCommand("xprop"); };
  } else {
    throw new Error("No supported desktop clipboard is available. Use comment_on_copy.open with selected text in Herdr.");
  }
  return {
    readClipboard: () => execute(read),
    writeClipboard: text => write(copy, text),
    sample: async () => {
      const [foreground, text] = await Promise.all([front(), execute(read)]);
      return { front: foreground, text };
    },
    checkAutomatic: check,
    close: () => {},
  };
}
let desktop: Desktop | undefined;
export const getDesktop = () => desktop ||= createDesktop();
export const readClipboard = () => getDesktop().readClipboard();
export async function writeClipboard(text: string): Promise<void> {
  const revision = await getDesktop().writeClipboard(text);
  rememberPopupCopy(text, revision || undefined);
}
export function closeDesktop() { desktop?.close(); desktop = undefined; }

export async function processCommand(pid: number): Promise<string> {
  if (process.platform !== "win32") return run(["ps", "-p", String(pid), "-o", "command="]);
  const bridge = new WindowsDesktop();
  try { return await bridge.request<string>({ action: "process", pid }) || ""; }
  finally { bridge.close(); }
}
