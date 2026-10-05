import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const stateRoot = process.env.XDG_STATE_HOME || (process.platform === "win32"
  ? process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local") : join(homedir(), ".local", "state"));
export const stateDir = process.env.HERDR_PLUGIN_STATE_DIR || join(stateRoot, "herdr", "plugins", "comment_on_copy");
export const paths = {
  pid: join(stateDir, "watch.pid"),
  stop: join(stateDir, "watch.stop"),
  payload: join(stateDir, "payload.json"),
  lock: join(stateDir, "popup.lock"),
  watchLog: join(stateDir, "watch.log"),
  captureLog: join(stateDir, "capture.log"),
  clipboardOutput: join(stateDir, "clipboard-output.json"),
};
export const ensureState = () => mkdirSync(stateDir, { recursive: true, mode: 0o700 });
export function remove(path: string) {
  try { unlinkSync(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
export function readPid(): number | null {
  try {
    const value = Number(readFileSync(paths.pid, "utf8").trim());
    return Number.isSafeInteger(value) && value > 1 ? value : null;
  } catch { return null; }
}
export function claimPid() {
  ensureState();
  writeFileSync(paths.pid, String(process.pid), { flag: "wx", mode: 0o600 });
  remove(paths.stop);
}
export function releasePid() {
  if (readPid() === process.pid) { remove(paths.stop); remove(paths.pid); }
}
export function stopRequested() {
  if (readPid() !== process.pid) return true;
  try { return readFileSync(paths.stop, "utf8").trim() === String(process.pid); } catch { return false; }
}
