import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stateDir } from "./paths.ts";
import type { Collected, Payload } from "./types.ts";

export interface CollectionStore {
  list(): Collected[];
  add(payload: Payload, comment: string): Collected;
  remove(ids: string[]): Collected[];
  restore(items: Collected[]): void;
}

function valid(item: Collected): boolean {
  return !!item && typeof item.id === "string" && typeof item.created_at === "string"
    && Number.isFinite(Date.parse(item.created_at)) && typeof item.text === "string" && !!item.text.trim()
    && typeof item.comment === "string"
    && (item.captured_at === undefined || (typeof item.captured_at === "string" && Number.isFinite(Date.parse(item.captured_at))))
    && (item.context === undefined || (Array.isArray(item.context) && item.context.every(pair =>
      Array.isArray(pair) && pair.length === 2 && pair.every(value => typeof value === "string"))))
    && (item.source == null || (typeof item.source.pane_id === "string"
      && (item.source.row === undefined || (Number.isInteger(item.source.row) && item.source.row >= 0))))
    && (item.origin == null || (typeof item.origin.pane_id === "string"
      && [item.origin.tab_id, item.origin.workspace_id].every(value => value === undefined || typeof value === "string")));
}

/** Atomic replacement keeps previous data intact on failure; the lock prevents lost updates. */
export class Collection implements CollectionStore {
  constructor(readonly file = join(stateDir, "collection.json")) {}

  list(): Collected[] {
    let data: string;
    try { data = readFileSync(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.version !== 1 || !Array.isArray(parsed.items) || !parsed.items.every(valid)
        || new Set(parsed.items.map((item: Collected) => item.id)).size !== parsed.items.length) throw new Error();
      return parsed.items.sort((a: Collected, b: Collected) => a.created_at.localeCompare(b.created_at));
    } catch { throw new Error("Collection data is invalid; existing data has been preserved."); }
  }

  private update<T>(change: (items: Collected[]) => { items: Collected[]; result: T }): T {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    const lock = `${this.file}.lock`, owner = `${process.pid}:${randomUUID()}`;
    try {
      const pid = Number(readFileSync(lock, "utf8").split(":")[0]);
      let stale = false;
      if (Number.isSafeInteger(pid) && pid > 1) {
        try { process.kill(pid, 0); } catch (error) { stale = (error as NodeJS.ErrnoException).code === "ESRCH"; }
      } else stale = Date.now() - statSync(lock).mtimeMs > 30000;
      if (stale) unlinkSync(lock);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    try { writeFileSync(lock, owner, { flag: "wx", mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("Collection is busy; try again.");
      throw error;
    }
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      const { items, result } = change(this.list());
      writeFileSync(temporary, JSON.stringify({ version: 1, items }), { flag: "wx", mode: 0o600 });
      renameSync(temporary, this.file);
      return result;
    } finally {
      try { unlinkSync(temporary); } catch { /* Not created, or already renamed. */ }
      try { if (readFileSync(lock, "utf8") === owner) unlinkSync(lock); } catch { /* Already released. */ }
    }
  }

  add(payload: Payload, comment: string): Collected {
    if (!payload.text.trim()) throw new Error("Select or copy text before collecting.");
    const { text, source, origin, context, captured_at } = payload;
    const item = structuredClone({ id: randomUUID(), created_at: new Date().toISOString(),
      text, comment, source, origin, context, captured_at });
    return this.update(items => ({ items: [...items, item], result: item }));
  }

  remove(ids: string[]): Collected[] {
    const selected = new Set(ids);
    return this.update(items => ({ items: items.filter(item => !selected.has(item.id)),
      result: items.filter(item => selected.has(item.id)) }));
  }

  restore(restored: Collected[]): void {
    if (!restored.every(valid)) throw new Error("Cannot restore invalid collection entries.");
    this.update(items => {
      const existing = new Set(items.map(item => item.id));
      return { items: [...items, ...restored.filter(item => !existing.has(item.id))], result: undefined };
    });
  }
}
