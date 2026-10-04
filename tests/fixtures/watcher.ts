import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watch } from "../../src/watch.ts";
import { toggle } from "../../src/toggle.ts";
import { spawnWatcher } from "../../src/system.ts";
import type { Desktop } from "../../src/platform.ts";

const desktop: Desktop = {
  readClipboard: async () => readFileSync(process.env.MOCK_CLIPBOARD!, "utf8"),
  writeClipboard: async () => {},
  sample: async () => ({ front: readFileSync(process.env.MOCK_FRONT!, "utf8"), text: readFileSync(process.env.MOCK_CLIPBOARD!, "utf8") }),
  checkAutomatic: () => { if (process.env.MOCK_UNSUPPORTED) throw new Error("Unsupported desktop; use comment_on_copy.open"); },
  close: () => {},
};
if (process.argv[2] === "watch") await watch(desktop);
else await toggle(() => spawnWatcher([import.meta.path, "watch", join(import.meta.dir, "../../src/watch.ts")]));
