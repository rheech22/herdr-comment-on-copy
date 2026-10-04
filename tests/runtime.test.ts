import { expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { supported } from "../scripts/run.ts";

test.skipIf(process.platform === "win32")("Unix wrapper selects a compatible fallback and preserves the runtime for child commands", async () => {
  const root = mkdtempSync(join(tmpdir(), "coc-runtime-"));
  try {
    const bin = join(root, "old-bin");
    const local = join(root, ".local/bin");
    mkdirSync(bin);
    mkdirSync(local, { recursive: true });
    const log = join(root, "commands");
    const executable = (path: string, version: string) => writeFileSync(path,
      `#!/bin/sh\nif [ "$1" = --version ]; then printf '${version}\\n'; else printf '%s\\n' "$*" >> "$MOCK_RUNTIME_LOG"; printf '%s\\n' "$(command -v bun)" >> "$MOCK_RUNTIME_LOG"; fi\n`, { mode: 0o755 });
    executable(join(bin, "bun"), "1.2.17");
    executable(join(local, "bun"), "1.4.2");
    const env = { ...process.env, HOME: root, PATH: bin + ":" + process.env.PATH,
      COMMENT_ON_COPY_BUN: "", MOCK_RUNTIME_LOG: log };
    const runner = join(import.meta.dir, "../scripts/run.sh");
    const installed = Bun.spawn(["sh", runner, "install"], { env, stderr: "pipe" });
    expect(await installed.exited).toBe(0);
    expect(readFileSync(log, "utf8").split("\n").slice(0, 2)).toEqual(["install --frozen-lockfile", join(local, "bun")]);
    rmSync(log);
    const rejected = Bun.spawn(["sh", runner, "install"], {
      env: { ...env, COMMENT_ON_COPY_BUN: join(bin, "bun") }, stderr: "pipe",
    });
    const error = await new Response(rejected.stderr).text();
    expect(await rejected.exited).toBe(1);
    expect(error).toContain("Bun 1.3.0+");
    expect(existsSync(log)).toBe(false);
    const portable = Bun.spawn([process.execPath, join(import.meta.dir, "../scripts/run.ts"), "install"], {
      env: { ...env, COMMENT_ON_COPY_BUN: join(bin, "bun") }, stderr: "pipe",
    });
    expect(await new Response(portable.stderr).text()).toContain("Bun 1.3.0+");
    expect(await portable.exited).not.toBe(0);
    expect(existsSync(log)).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("portable launcher checks Bun versions", () => {
  for (const version of ["1.3.0", "1.4.2", "2.0.0"]) expect(supported(version)).toBe(true);
  for (const version of ["1.2.17", "0.9.0", "unknown"]) expect(supported(version)).toBe(false);
});
