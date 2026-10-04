import { expect, test } from "bun:test";
import { join } from "node:path";
import { createDesktop, focusedSway } from "../src/platform.ts";
import { WindowsDesktop } from "../src/windows.ts";

test("X11 uses CLIPBOARD and gets the foreground window class", async () => {
  const calls: string[][] = [];
  let copied: unknown;
  const execute = async (argv: string[]) => {
    calls.push(argv);
    if (argv[0] === "xclip") return "copied\n한글🙂";
    if (argv.includes("-root")) return "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x123";
    return 'WM_CLASS(STRING) = "kitty", "kitty"';
  };
  const desktop = createDesktop("linux", { DISPLAY: ":1" }, execute,
    async (argv, text) => { copied = [argv, text]; }, () => "available");
  desktop.checkAutomatic();
  expect(await desktop.sample()).toEqual({ front: "kitty kitty", text: "copied\n한글🙂" });
  await desktop.writeClipboard("result\n");
  expect(copied).toEqual([["xclip", "-selection", "clipboard", "-in"], "result\n"]);
  expect(calls).toContainEqual(["xclip", "-selection", "clipboard", "-out"]);
});

test("Wayland takes precedence over XWayland and retains clipboard newlines", async () => {
  const calls: string[][] = [];
  const desktop = createDesktop("linux", { DISPLAY: ":1", WAYLAND_DISPLAY: "wayland-0", SWAYSOCK: "sway" }, async argv => {
    calls.push(argv);
    return argv[0] === "wl-paste" ? "line\n" : JSON.stringify({ nodes: [{ focused: true, app_id: "foot" }] });
  }, async () => {}, () => "available");
  desktop.checkAutomatic();
  expect(await desktop.sample()).toEqual({ front: "foot", text: "line\n" });
  expect(calls).toContainEqual(["wl-paste", "--no-newline", "--type", "text"]);
  expect(calls.some(argv => argv[0] === "xclip")).toBe(false);
});

test("Sway includes floating windows and Hyprland reads the focused class", async () => {
  expect(focusedSway({ nodes: [], floating_nodes: [{ nodes: [{ focused: true, window_properties: { class: "Alacritty" } }] }] })).toBe("Alacritty");
  const desktop = createDesktop("linux", { WAYLAND_DISPLAY: "wayland-0", HYPRLAND_INSTANCE_SIGNATURE: "test" },
    async argv => argv[0] === "hyprctl" ? '{"class":"kitty"}' : "selection", async () => {}, () => "available");
  desktop.checkAutomatic();
  expect(await desktop.sample()).toEqual({ front: "kitty", text: "selection" });
});

test("unsupported Wayland focus disables monitoring but leaves manual clipboard access", async () => {
  const desktop = createDesktop("linux", { WAYLAND_DISPLAY: "wayland-0" }, async () => "manual selection", async () => {}, () => "available");
  expect(() => desktop.checkAutomatic()).toThrow("comment_on_copy.open");
  expect(await desktop.readClipboard()).toBe("manual selection");
});

test("missing desktop tools and headless sessions fail explicitly", () => {
  const desktop = createDesktop("linux", { DISPLAY: ":1" }, async () => "", async () => {}, () => null);
  expect(() => desktop.checkAutomatic()).toThrow("Missing xclip");
  expect(() => createDesktop("linux", {})).toThrow("selected text");
});

test("macOS supports terminal hosts other than WezTerm", async () => {
  const desktop = createDesktop("darwin", {}, async argv => argv[0] === "pbpaste" ? "selection" : argv[1] === "front" ? "ASN:1" : 'name="Ghostty"',
    async () => {}, () => "available");
  expect(await desktop.sample()).toEqual({ front: "Ghostty", text: "selection" });
});

test("Windows bridge serializes Unicode requests in one persistent process and recovers clipboard errors", async () => {
  const bridge = new WindowsDesktop([process.execPath, join(import.meta.dir, "fixtures/windows-helper.ts")]);
  try {
    const text = '한글🙂\n"quoted"\r\nlast line\n';
    const [written, read] = await Promise.all([
      bridge.request<{ text: string; pid: number }>({ action: "write", text }),
      bridge.request<{ text: string; pid: number }>({ action: "read" }),
    ]);
    expect(read.text).toBe(text);
    expect(read.pid).toBe(written.pid);
    const error = await bridge.request({ action: "fail" }).catch(error => error as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Clipboard busy");
    expect((await bridge.request<{ text: string }>({ action: "read" })).text).toBe(text);
  } finally { bridge.close(); }
});

test.skipIf(process.env.COMMENT_ON_COPY_NATIVE_TESTS !== "1")("native desktop clipboard preserves Unicode and multiline text", async () => {
  const desktop = createDesktop();
  let original = "";
  try {
    try { original = await desktop.readClipboard(); } catch { /* A fresh CI desktop may have no selection. */ }
    const text = '한글 中文 日本語 🙂\r\nline two\n';
    await desktop.writeClipboard(text);
    expect(await desktop.readClipboard()).toBe(text);
    desktop.checkAutomatic();
    expect(typeof (await desktop.sample()).front).toBe("string");
  } finally {
    try { await desktop.writeClipboard(original); } finally { desktop.close(); }
  }
}, 30000);
