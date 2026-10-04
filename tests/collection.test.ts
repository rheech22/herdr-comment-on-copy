import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Collection } from "../src/collection.ts";
import { composeCollection, deliverText } from "../src/model.ts";
import { agent, fakeApi } from "./helpers.ts";

let directory: string | undefined;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); directory = undefined; });
function create() {
  directory = mkdtempSync(join(tmpdir(), "comment-collection-"));
  return new Collection(join(directory, "collection.json"));
}

describe("collection persistence", () => {
  test("preserves Unicode, comments and capture-time context after reopening, without saving agent targets", () => {
    const store = create();
    const payload = { text: "한글🙂\nsecond line", agents: [agent("old-pane")],
      focused_pane_id: "old-pane", context: [["workspace", "first"]] as [string, string][], captured_at: "2026-01-01T00:00:00.000Z" };
    const saved = store.add(payload, "feedback");
    payload.context[0]![1] = "changed";
    const entries = new Collection(store.file).list();
    expect(entries).toEqual([saved]);
    expect(entries[0]!.context).toEqual([["workspace", "first"]]);
    expect(readFileSync(store.file, "utf8")).not.toContain("old-pane");
    expect(readdirSync(directory!)).toEqual(["collection.json"]);
    if (process.platform !== "win32") expect(statSync(store.file).mode & 0o777).toBe(0o600);
  });
  test("independent store instances retain each other's additions and bulk deletion can be undone", () => {
    const store = create(), other = new Collection(store.file);
    const first = store.add({ text: "first" }, "one"), second = other.add({ text: "second" }, "two");
    const third = store.add({ text: "third" }, "three");
    expect(store.list()).toHaveLength(3);
    const deleted = other.remove([first.id, third.id]);
    expect(store.list()).toEqual([second]);
    store.restore(deleted);
    store.restore(deleted);
    expect(new Set(store.list().map(item => item.id))).toEqual(new Set([first.id, second.id, third.id]));
    expect(store.list()).toHaveLength(3);
  });
  test("corrupt or unsupported data is reported and never overwritten by an addition", () => {
    const store = create();
    for (const data of ['{broken', '{"version":2,"items":[]}', '{"version":1,"items":[{"text":"missing fields"}]}']) {
      writeFileSync(store.file, data);
      expect(() => store.list()).toThrow("preserved");
      expect(() => store.add({ text: "new text" }, "comment")).toThrow("preserved");
      expect(readFileSync(store.file, "utf8")).toBe(data);
      expect(readdirSync(directory!)).toEqual(["collection.json"]);
    }
  });
  test("a live writer prevents mutations; an abandoned writer lock is recovered", () => {
    const store = create();
    const first = store.add({ text: "first" }, "feedback");
    writeFileSync(`${store.file}.lock`, `${process.pid}:active`);
    expect(() => store.remove([first.id])).toThrow("busy");
    expect(store.list()).toEqual([first]);
    // Pick a process ID verified absent on this host rather than assuming a fixed PID is unused.
    let absent = 999999;
    for (;;) { try { process.kill(absent, 0); absent++; } catch { break; } }
    writeFileSync(`${store.file}.lock`, `${absent}:abandoned`);
    expect(store.add({ text: "second" }, "feedback").text).toBe("second");
    expect(store.list()).toHaveLength(2);
  });
  test("blank selections are rejected without creating collection data", () => {
    const store = create();
    expect(() => store.add({ text: " \n" }, "comment")).toThrow("Select or copy");
    expect(store.list()).toEqual([]);
  });
  test("blank comments cannot be added and do not change existing data", () => {
    const store = create(); store.add({ text: "existing" }, "feedback");
    const previous = readFileSync(store.file, "utf8");
    for (const comment of ["", " \n\t"]) expect(() => store.add({ text: "new" }, comment)).toThrow("Add a comment");
    expect(readFileSync(store.file, "utf8")).toBe(previous);
  });
});

describe("collection delivery", () => {
  test("keeps each item's context and comment, orders by capture collection time, and escapes nested boundaries", async () => {
    const store = create();
    const first = store.add({ text: "first <item>quoted</item>", context: [["workspace", "one"]] }, "first comment");
    const second = store.add({ text: "second", context: [["workspace", "two"]] }, "feedback");
    first.created_at = "2026-01-01T00:00:00.000Z";
    second.created_at = "2026-01-02T00:00:00.000Z";
    const text = composeCollection([second, first]);
    expect(text.indexOf("workspace: one")).toBeLessThan(text.indexOf("workspace: two"));
    expect(text).toContain("<item-2>");
    expect(text).toContain("first comment");
    expect(text).toContain("collected_at: 2026-01-01");
    const calls: unknown[] = [];
    const api = fakeApi((method, params) => { calls.push([method, params]); return { result: {} }; });
    expect((await deliverText(api, async () => {}, text, agent("new-pane"), true)).kind).toBe("ok");
    expect(calls).toEqual([["agent.prompt", { target: "new-pane", text }]]);
    expect(store.list()).toHaveLength(2);
  });
  test("failed submission retains entries and failed insertion copies the entire batch as a fallback", async () => {
    const store = create(); store.add({ text: "one" }, "feedback"); store.add({ text: "two" }, "feedback");
    const text = composeCollection(store.list());
    const api = fakeApi(() => ({ error: { message: "approval pending" } }));
    const copies: string[] = [];
    expect((await deliverText(api, async text => { copies.push(text); }, text, agent("p1"), true)).close).toBe(false);
    expect(copies).toEqual([]);
    expect((await deliverText(api, async text => { copies.push(text); }, text, agent("p1"), false)).kind).toBe("warn");
    expect(copies).toEqual([text + "\n"]);
    expect(store.list()).toHaveLength(2);
  });
});
