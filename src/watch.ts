import { existsSync } from "node:fs";
import { ClipboardHistory, consumePopupCopy } from "./clipboard.ts";
import { clearStaleLock, openNote } from "./capture.ts";
import { Herdr } from "./herdr.ts";
import { claimPid, paths, readPid, releasePid, remove, stopRequested } from "./paths.ts";
import { createDesktop, type Desktop } from "./platform.ts";
import { runningPid } from "./toggle.ts";
import { traceCapture } from "./diagnostics.ts";

export async function watch(desktop: Desktop = createDesktop()) {
  try {
    // Validate both clipboard and focus support before reporting the mode as on.
    desktop.checkAutomatic();
    const initial = await desktop.sample();
    const previousPid = readPid();
    if (await runningPid()) return;
    if (previousPid && readPid() === previousPid) remove(paths.pid);
    try { claimPid(); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
      throw error;
    }
    const api = new Herdr();
    let stopping = false;
    const stop = () => { stopping = true; };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    clearStaleLock();
    let marking: Promise<void> | undefined;
    try {
      const history = new ClipboardHistory(initial.text, initial.revision);
      history.observe(initial.text, initial.front, initial.revision);
      let markedAt = 0;
      let errorLogged = false;
      while (!stopping && !stopRequested()) {
        await Bun.sleep(100);
        if (stopping || stopRequested()) break;
        if (!marking && Date.now() - markedAt > 5000) {
          clearStaleLock();
          markedAt = Date.now();
          marking = api.mark(true).finally(() => { marking = undefined; });
        }
        try {
          const { front, text, revision } = await desktop.sample();
          if (stopping || stopRequested()) break;
          const decision = history.observe(text, front, revision, consumePopupCopy(text, revision));
          errorLogged = false;
          if (decision === "unchanged") continue;
          const chars = Array.from(text).length;
          const lines = text.split("\n").length;
          const started = Date.now();
          if (decision !== "open") { traceCapture(decision, chars, lines); continue; }
          if (existsSync(paths.lock)) { traceCapture("popup-open", chars, lines); continue; }
          // A terminal foreground alone does not establish that the copy came from Herdr.
          const source = await api.locate(text);
          if (!source || stopping || stopRequested()) { traceCapture("source-not-found", chars, lines, Date.now() - started); continue; }
          const opened = await openNote(api, text, source);
          traceCapture(opened ? "opened" : "popup-open", chars, lines, Date.now() - started, source.pane_id);
        } catch (error) {
          if (!errorLogged) {
            traceCapture("sampling-or-popup-error", 0, 0);
            console.error((error as Error).message);
          }
          errorLogged = true;
        }
      }
    } finally {
      // Wait for an in-flight refresh before removing the indicator.
      await marking;
      await api.mark(false);
      releasePid();
      process.off("SIGTERM", stop);
      process.off("SIGINT", stop);
    }
  } finally { desktop.close(); }
}
if (import.meta.main) await watch();
