import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { enrichPayload } from "../src/enrich.ts";
import { selectionContext } from "../src/context.ts";
import { fakeApi } from "./helpers.ts";
import type { Payload } from "../src/types.ts";

test("agents load independently of slow pane metadata and one capture shares duplicate requests", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: string[] = [];
  const api = fakeApi(async (method, params) => {
    calls.push(method);
    if (method === "pane.get") {
      expect(params.pane_id).toBe("source");
      await gate;
      return { result: { pane: { pane_id: "source", tab_id: "t1", workspace_id: "w1", cwd: homedir() } } };
    }
    if (method === "pane.process_info") return { result: { process_info: { foreground_processes: [{ name: "nvim" }] } } };
    if (method === "agent.list") return { result: { agents: [{ pane_id: "target", agent: "codex", workspace_id: "w1", tab_id: "t1" }] } };
    if (method === "workspace.list") return { result: { workspaces: [{ workspace_id: "w1", label: "test" }] } };
    if (method === "tab.list") return { result: { tabs: [{ tab_id: "t1", label: "code" }] } };
    throw new Error(`Unexpected ${method}`);
  });
  const payload: Payload = { text: "selection", source: { pane_id: "source" }, agents_pending: true,
    context: selectionContext("source", "selection", null) };
  const work = enrichPayload(api, payload, patch => Object.assign(payload, patch), new AbortController().signal);
  for (let i = 0; i < 20 && payload.agents_pending; i++) await Bun.sleep(1);
  expect(payload.agents_pending).toBe(false);
  expect(payload.agents?.[0]?.name).toBe("codex · test");
  expect(payload.context?.some(([key]) => key === "process")).toBe(false);
  release();
  await work;
  expect(payload.origin).toEqual({ pane_id: "source", tab_id: "t1", workspace_id: "w1" });
  expect(payload.context).toContainEqual(["process", "nvim"]);
  for (const method of ["pane.get", "workspace.list", "tab.list"]) expect(calls.filter(value => value === method)).toHaveLength(1);
  expect(calls).not.toContain("pane.current");
});

test("closing a popup discards delayed updates; a different capture retains its own context", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const api = fakeApi(async () => { await gate; return { result: {} }; });
  const controller = new AbortController();
  const patches: Partial<Payload>[] = [];
  const next: Payload = { text: "next selection", context: selectionContext("next", "next selection", null) };
  const before = JSON.stringify(next);
  const work = enrichPayload(api, { text: "old selection", source: { pane_id: "old" } }, patch => patches.push(patch), controller.signal);
  controller.abort();
  release();
  await work;
  expect(patches).toEqual([]);
  expect(JSON.stringify(next)).toBe(before);
});
