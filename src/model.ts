import type { Agent, Collected, Payload } from "./types.ts";
import type { Herdr } from "./herdr.ts";

export function tag(name: string, body: string): string {
  let label = name;
  let index = 1;
  while (body.includes(`<${label}>`) || body.includes(`</${label}>`)) label = `${name}-${++index}`;
  return `<${label}>\n${body}\n</${label}>`;
}
export function compose(payload: Payload, comment: string): string {
  const blocks: string[] = [];
  if (payload.context?.length) blocks.push(tag("context", payload.context.map(([key, value]) => `${key}: ${value}`).join("\n")));
  blocks.push(tag("selection", payload.text.replace(/\n+$/, "")), tag("comment", comment.trim()));
  return blocks.join("\n\n");
}
export function pickTarget(payload: Payload): Agent | null {
  const agents = payload.agents || [];
  for (const pane of [payload.source?.pane_id, payload.focused_pane_id]) {
    const found = pane && agents.find(agent => agent.pane_id === pane);
    if (found) return found;
  }
  for (const field of ["tab_id", "workspace_id"] as const) {
    if (!payload.origin?.[field]) continue;
    const near = agents.filter(agent => agent[field] === payload.origin![field]);
    if (near.length === 1) return near[0]!;
  }
  return agents.length === 1 ? agents[0]! : null;
}
export interface Delivery { close: boolean; message: string; kind: "ok" | "warn"; }
export function composeCollected(item: Collected): string {
  return compose({ ...item, context: [...(item.context || []),
    ...(item.captured_at ? [["captured_at", item.captured_at] as [string, string]] : []),
    ["collected_at", item.created_at]],
  }, item.comment);
}
export function composeCollection(items: Collected[]): string {
  const ordered = [...items].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const blocks = ordered.map(item => tag("item", composeCollected(item)));
  return tag("collection", blocks.join("\n\n"));
}

export async function deliverText(api: Herdr, copy: (text: string) => Promise<void>, text: string,
  agent: Agent | null, submit: boolean): Promise<Delivery> {
  if (!agent) return { close: false, message: "choose a target with ^L", kind: "warn" };
  try {
    await api.result(submit ? "agent.prompt" : "pane.send_input", submit
      ? { target: agent.pane_id, text } : { pane_id: agent.pane_id, text });
    return { close: true, message: `${submit ? "sent" : "inserted"} → ${agent.name}`, kind: "ok" };
  } catch (error) {
    if (submit) return { close: false, message: (error as Error).message, kind: "warn" };
    try { await copy(text + "\n"); }
    catch { return { close: false, message: "insertion and clipboard copy failed", kind: "warn" }; }
    return { close: true, message: "insert failed, copied to clipboard instead", kind: "warn" };
  }
}
export async function deliver(api: Herdr, copy: (text: string) => Promise<void>, payload: Payload,
  comment: string, agent: Agent | null, submit: boolean): Promise<Delivery> {
  if (!payload.text.trim()) return { close: false, message: "select or copy text first", kind: "warn" };
  if (!comment.trim()) return { close: false, message: "nothing yet, the comment is empty", kind: "warn" };
  return deliverText(api, copy, compose(payload, comment), agent, submit);
}
