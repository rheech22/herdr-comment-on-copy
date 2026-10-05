import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("a stale sample cannot consume a pending popup copy, and a later identical user copy is distinct", async () => {
  const state = mkdtempSync(join(tmpdir(), "coc-output-"));
  const code = `
    import { rememberPopupCopy, consumePopupCopy } from './src/clipboard.ts';
    import { paths } from './src/paths.ts';
    import { readFileSync, existsSync } from 'node:fs';
    rememberPopupCopy('private clipboard result', '2');
    const early = consumePopupCopy('previous clipboard', '1');
    const pending = existsSync(paths.clipboardOutput);
    const privateTextAbsent = !readFileSync(paths.clipboardOutput, 'utf8').includes('private clipboard result');
    const result = consumePopupCopy('private clipboard result', '2');
    const consumed = !existsSync(paths.clipboardOutput);
    rememberPopupCopy('private clipboard result', '2');
    const newCopy = consumePopupCopy('private clipboard result', '3');
    console.log(JSON.stringify({ early, pending, privateTextAbsent, result, consumed, newCopy }));
  `;
  try {
    const child = Bun.spawn([process.execPath, "--eval", code], { cwd: join(import.meta.dir, ".."),
      env: { ...process.env, HERDR_PLUGIN_STATE_DIR: state }, stdout: "pipe", stderr: "pipe" });
    const output = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    expect(JSON.parse(output)).toEqual({ early: false, pending: true, privateTextAbsent: true, result: true, consumed: true, newCopy: false });
  } finally { rmSync(state, { recursive: true, force: true }); }
});
