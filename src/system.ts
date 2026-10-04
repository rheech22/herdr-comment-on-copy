import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { closeSync, openSync } from "node:fs";
import { ensureState, paths } from "./paths.ts";

export async function run(argv: string[], timeout = 2000, signal?: AbortSignal): Promise<string> {
  const [file, ...args] = argv;
  if (!file) throw new Error("Empty command");
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout, signal, windowsHide: true, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}
export async function writeCommand(argv: string[], text: string) {
  const child = Bun.spawn(argv, {
    stdin: new Blob([text]), stdout: "ignore", stderr: "ignore", timeout: 2000,
  });
  if (await child.exited !== 0) throw new Error("Could not copy to clipboard");
}
export function spawnWatcher(argv = [join(import.meta.dir, "watch.ts")]) {
  ensureState();
  const log = openSync(paths.watchLog, "a", 0o600);
  try {
    const child = spawn(process.execPath, argv, {
      detached: true, stdio: ["ignore", "ignore", log], env: process.env, windowsHide: true,
    });
    child.unref();
    return child;
  } finally { closeSync(log); }
}
