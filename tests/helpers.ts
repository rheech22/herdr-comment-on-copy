import { Herdr } from "../src/herdr.ts";
import type { Agent, ApiReply, Call } from "../src/types.ts";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export const socketPath = (root: string) => process.platform === "win32"
  ? `\\\\.\\pipe\\comment-test-${randomUUID()}` : join(root, "api.sock");

export function agent(pane: string, tab = "t1", workspace = "w1"): Agent {
  return { pane_id: pane, pane_no: pane, agent: "claude", name: pane, tab_id: tab,
    workspace_id: workspace, workspace, tab };
}
export function fakeApi(handler: (method: string, params: Record<string, unknown>) => ApiReply<unknown> | Promise<ApiReply<unknown>>) {
  const request: Call = async <T>(method: string, params: Record<string, unknown>) => await handler(method, params) as ApiReply<T>;
  return new Herdr(request);
}
