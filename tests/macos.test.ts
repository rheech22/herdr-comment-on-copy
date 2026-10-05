import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DesktopBridge } from "../src/desktop-bridge.ts";
import type { ClipboardSample } from "../src/platform.ts";

test.skipIf(process.platform !== "darwin")("macOS helper preserves long UTF-8 copies and detects identical writes on an isolated pasteboard", async () => {
  const dir = mkdtempSync(join(tmpdir(), "coc-macos-"));
  const script = join(dir, "macos.js");
  // Exercise the real helper without modifying the user's general clipboard.
  const name = `herdr-comment-test-${crypto.randomUUID()}`;
  writeFileSync(script, readFileSync(join(import.meta.dir, "../scripts/macos.js"), "utf8")
    .replace("$.NSPasteboard.generalPasteboard", `$.NSPasteboard.pasteboardWithName($("${name}"))`));
  const bridge = new DesktopBridge(["/usr/bin/osascript", "-l", "JavaScript", script]);
  try {
    const text = ('한글 中文 日本語 🙂\\ "quoted"\r\nline two\n').repeat(10000);
    const first = await bridge.request<string>({ action: "write", text });
    expect(await bridge.request<string>({ action: "read" })).toBe(text);
    expect((await bridge.request<ClipboardSample>({ action: "sample" })).revision).toBe(first);
    const second = await bridge.request<string>({ action: "write", text });
    expect(second).not.toBe(first);
    const sample = await bridge.request<ClipboardSample>({ action: "sample" });
    expect(sample.text).toBe(text);
    expect(sample.revision).toBe(second);
    expect(await bridge.request({ action: "invalid" }).catch(error => error.message)).toBe("Unknown clipboard operation");
    await bridge.request({ action: "write", text: "" });
    expect(await bridge.request<string>({ action: "read" })).toBe("");
  } finally { bridge.close(); rmSync(dir, { recursive: true, force: true }); }
}, 30000);
