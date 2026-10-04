import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watch } from "../../src/watch.ts";
import { toggle } from "../../src/toggle.ts";
import { spawnWatcher } from "../../src/system.ts";
import type { Desktop } from "../../src/platform.ts";
import { enrichPayload } from "../../src/enrich.ts";
import { Herdr } from "../../src/herdr.ts";
import { paths } from "../../src/paths.ts";
import type { Payload } from "../../src/types.ts";

const desktop: Desktop = {
  readClipboard: async () => readFileSync(process.env.MOCK_CLIPBOARD!, "utf8"),
  writeClipboard: async () => {},
  sample: async () => ({ front: readFileSync(process.env.MOCK_FRONT!, "utf8"), text: readFileSync(process.env.MOCK_CLIPBOARD!, "utf8") }),
  checkAutomatic: () => { if (process.env.MOCK_UNSUPPORTED) throw new Error("Unsupported desktop; use comment_on_copy.open"); },
  close: () => {},
};
if (process.argv[2] === "watch") await watch(desktop);
else if (process.argv[2] === "enrich") {
  const payload = JSON.parse(readFileSync(paths.payload, "utf8")) as Payload;
  await enrichPayload(new Herdr(), payload, patch => Object.assign(payload, patch), new AbortController().signal);
  console.log(JSON.stringify(payload));
}
else await toggle(() => spawnWatcher([import.meta.path, "watch", join(import.meta.dir, "../../src/watch.ts")]));
