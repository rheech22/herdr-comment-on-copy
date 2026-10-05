import { join } from "node:path";
import { DesktopBridge } from "./desktop-bridge.ts";

/** One STA PowerShell process serves clipboard requests without repeated startup. */
export class WindowsDesktop extends DesktopBridge {
  constructor(command = ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-File", join(import.meta.dir, "../scripts/windows.ps1")]) { super(command); }
}
