import { buildContext, originOf } from "./context.ts";
import { Herdr } from "./herdr.ts";
import type { Payload } from "./types.ts";

/** Each popup owns its updates; nothing writes back into the next capture's payload file. */
export async function enrichPayload(api: Herdr, payload: Payload, update: (patch: Partial<Payload>) => void,
  signal: AbortSignal) {
  if (signal.aborted) return;
  const snapshot = api.snapshot(signal);
  const paneId = payload.source?.pane_id || payload.focused_pane_id || null;
  const publish = (patch: Partial<Payload>) => { if (!signal.aborted) update(patch); };
  await Promise.all([
    snapshot.agents().then(agents => publish({ agents, agents_pending: false })),
    originOf(snapshot, paneId).then(origin => publish({ origin })),
    payload.view === "collection" ? null : buildContext(snapshot, paneId, payload.text, payload.source || null,
      { signal, update: context => publish({ context }) }),
  ]);
}
