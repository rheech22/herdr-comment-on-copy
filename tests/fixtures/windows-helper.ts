import { createInterface } from "node:readline";

let text = "";
createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (request.action === "write") text = request.text;
  const reply = request.action === "fail" ? { error: "Clipboard busy" } : { result: { text, pid: process.pid } };
  process.stdout.write(JSON.stringify(reply) + "\n");
});
