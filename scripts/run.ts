import { spawnSync } from "node:child_process";
import { dirname, delimiter, join } from "node:path";
import { homedir } from "node:os";
import { realpathSync } from "node:fs";

export const supported = (version: string) => {
  const match = /^(\d+)\.(\d+)\./.exec(version.trim());
  return !!match && (Number(match[1]) > 1 || Number(match[1]) === 1 && Number(match[2]) >= 3);
};
export function runtime() {
  const explicit = process.env.COMMENT_ON_COPY_BUN;
  const suffix = process.platform === "win32" ? ".exe" : "";
  const candidates = explicit ? [explicit] : [process.execPath,
    join(homedir(), `.local/bin/bun${suffix}`), join(homedir(), `.bun/bin/bun${suffix}`)];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["--version"], { encoding: "utf8", timeout: 2000, windowsHide: true });
    if (result.status === 0 && supported(result.stdout)) return realpathSync(Bun.which(candidate) || candidate);
  }
  throw new Error("Comment on Copy requires Bun 1.3.0+. Install Bun or set COMMENT_ON_COPY_BUN to its executable.");
}
async function main() {
  const executable = runtime();
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === "path") || "PATH";
  process.env[pathKey] = dirname(executable) + delimiter + (process.env[pathKey] || "");
  const root = join(import.meta.dir, "..");
  process.chdir(root);
  const [action, ...args] = process.argv.slice(2);
  const child = async (argv: string[]) => {
    const command = Bun.spawn(argv, { stdin: "inherit", stdout: "inherit", stderr: "inherit", cwd: root, env: { ...process.env } });
    const stop = () => command.kill();
    process.on("SIGTERM", stop);
    try { process.exitCode = await command.exited; } finally { process.off("SIGTERM", stop); }
  };
  if (executable !== realpathSync(process.execPath)) return child([executable, import.meta.path, ...process.argv.slice(2)]);
  switch (action) {
    case "install": return child([executable, "install", "--frozen-lockfile", ...args]);
    case "check": return child([executable, "run", "--bun", "check", ...args]);
    case "toggle": return (await import("../src/toggle.ts")).toggle();
    case "open": return (await import("../src/open.ts")).open();
    case "note": return (await import("../src/note.ts")).main();
    default: throw new Error("Usage: bun run scripts/run.ts install|check|toggle|open|note");
  }
}
if (import.meta.main) await main();
