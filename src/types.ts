export interface Pane {
  pane_id: string;
  workspace_id?: string;
  tab_id?: string;
  focused?: boolean;
  label?: string;
  agent?: string;
  terminal_title_stripped?: string;
  foreground_cwd?: string;
  cwd?: string;
}

export interface Agent {
  pane_id: string;
  pane_no: string;
  workspace_id?: string;
  tab_id?: string;
  agent: string;
  workspace: string;
  tab: string;
  name: string;
}

export interface Source {
  pane_id: string;
  row?: number;
}

export type Origin = Pick<Pane, "pane_id" | "tab_id" | "workspace_id">;
export type Context = [string, string][];
export interface Payload {
  text: string;
  view?: "comment" | "collection";
  captured_at?: string;
  source?: Source | null;
  focused_pane_id?: string | null;
  agents?: Agent[];
  origin?: Origin | null;
  context?: Context;
}

export interface Collected extends Pick<Payload, "text" | "source" | "origin" | "context" | "captured_at"> {
  id: string;
  created_at: string;
  comment: string;
}

export interface ApiReply<T> {
  result?: T;
  error?: { code?: string; message: string };
}

export type Call = <T>(method: string, params: Record<string, unknown>) => Promise<ApiReply<T>>;
