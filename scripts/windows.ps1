$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ForegroundWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
}
'@

while ($null -ne ($line = [Console]::ReadLine())) {
    try {
        $request = $line | ConvertFrom-Json
        switch ($request.action) {
            'read' { $result = [Windows.Forms.Clipboard]::GetText() }
            'write' {
                if ([string]::IsNullOrEmpty($request.text)) {
                    [Windows.Forms.Clipboard]::Clear()
                } else {
                    [Windows.Forms.Clipboard]::SetText([string]$request.text)
                }
                $result = $null
            }
            'sample' {
                [uint32]$foregroundPid = 0
                $window = [ForegroundWindow]::GetForegroundWindow()
                [void][ForegroundWindow]::GetWindowThreadProcessId($window, [ref]$foregroundPid)
                $front = ''
                if ($foregroundPid -gt 0) {
                    $front = [Diagnostics.Process]::GetProcessById($foregroundPid).ProcessName
                }
                $result = @{ front = $front; text = [Windows.Forms.Clipboard]::GetText() }
            }
            'process' {
                $targetPid = [int]$request.pid
                $result = (Get-CimInstance Win32_Process -Filter "ProcessId = $targetPid").CommandLine
            }
            default { throw 'Unknown clipboard operation' }
        }
        $reply = @{ result = $result } | ConvertTo-Json -Compress -Depth 4
    } catch {
        $reply = @{ error = $_.Exception.Message } | ConvertTo-Json -Compress -Depth 4
    }
    [Console]::WriteLine($reply)
}
