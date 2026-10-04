import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { ensureState, paths, readPid, remove } from "./paths.ts";
import { Herdr } from "./herdr.ts";
import { spawnWatcher } from "./system.ts";
import { processCommand } from "./platform.ts";

export function alive(pid: number) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export async function runningPid(): Promise<number | null> {
  const pid = readPid();
  if (!pid || !alive(pid)) return null;
  try {
    const command = await processCommand(pid);
    const expected = join(import.meta.dir, "watch.ts");
    const normalize = (value: string) => process.platform === "win32" ? value.replace(/\\/g, "/").toLowerCase() : value;
    return normalize(command).includes(normalize(expected)) ? pid : null;
  } catch { return null; }
}
export async function toggle(start = spawnWatcher) {
  ensureState();
  const api = new Herdr();
  const pid = await runningPid();
  if (pid) {
    // A cooperative stop lets Windows run the same cleanup as Unix.
    writeFileSync(paths.stop, String(pid), { mode: 0o600 });
    for (let i = 0; i < 200 && readPid() === pid && alive(pid); i++) await Bun.sleep(50);
    if (readPid() === pid && alive(pid)) throw new Error("Watcher is still stopping; retry shortly.");
    if (readPid() === pid) remove(paths.pid);
    await api.mark(false);
    await api.notify("comment on copy: off", "Copying no longer opens the comment window.");
    return;
  }
  remove(paths.pid);
  const child = start();
  let spawnError: Error | undefined;
  child.on("error", error => { spawnError = error; });
  for (let i = 0; i < 300; i++) {
    const started = readPid();
    if (started === child.pid && alive(started)) {
      await api.notify("comment on copy: on", "Copy terminal text to open the comment window.");
      return;
    }
    if (spawnError || child.exitCode !== null) break;
    await Bun.sleep(50);
  }
  throw spawnError || new Error("Watcher did not start; check watch.log. Use comment_on_copy.open if automatic capture is unavailable.");
}
if (import.meta.main) await toggle();
