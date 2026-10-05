import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** A persistent JSON-lines helper avoids spawning a process for each clipboard poll. */
export class DesktopBridge {
  private child?: ChildProcessWithoutNullStreams;
  private buffer = "";
  private queue: Promise<unknown> = Promise.resolve();
  private pending?: { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

  constructor(private command: string[]) {}

  request<T>(request: Record<string, unknown>): Promise<T> {
    const result = this.queue.then(() => this.send<T>(request));
    this.queue = result.catch(() => {});
    return result;
  }
  private send<T>(request: Record<string, unknown>): Promise<T> {
    if (!this.child) {
      const [file, ...args] = this.command;
      this.child = spawn(file!, args, { stdio: "pipe", windowsHide: true });
      this.child.stdout.setEncoding("utf8");
      this.child.stdout.on("data", (chunk: string) => {
        this.buffer += chunk;
        if (this.buffer.length > 8 * 1024 * 1024) return this.fail(new Error("Desktop clipboard response is too large"));
        const end = this.buffer.indexOf("\n");
        if (end < 0) return;
        const line = this.buffer.slice(0, end);
        this.buffer = this.buffer.slice(end + 1);
        try {
          const reply = JSON.parse(line);
          const pending = this.pending;
          this.pending = undefined;
          if (!pending) return;
          clearTimeout(pending.timer);
          if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply.result);
        } catch { this.fail(new Error("Invalid Desktop clipboard response")); }
      });
      let error = "";
      this.child.stderr.setEncoding("utf8");
      this.child.stderr.on("data", chunk => { error = (error + chunk).slice(-2000); });
      this.child.once("error", reason => this.fail(reason));
      this.child.once("exit", () => this.fail(new Error(error.trim() || "Desktop clipboard helper exited")));
      this.child.stdin.on("error", reason => this.fail(reason));
    }
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error("Desktop clipboard helper timed out")), 10000);
      this.pending = { resolve, reject, timer };
      this.child!.stdin.write(JSON.stringify(request) + "\n");
    });
  }
  private fail(error: Error) {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
    this.close();
  }
  close() {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error("Desktop clipboard helper closed")); }
    const child = this.child;
    this.child = undefined;
    this.buffer = "";
    if (child) {
      child.removeAllListeners("exit");
      child.removeAllListeners("error");
      child.on("error", () => {});
      child.stdin.removeAllListeners("error");
      child.stdin.on("error", () => {});
      child.stdout.removeAllListeners("data");
      child.stdin.end();
      child.kill();
    }
  }
}
