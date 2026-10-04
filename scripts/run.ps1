$ErrorActionPreference = 'Stop'
$actionArgs = $args
$candidates = if ($env:COMMENT_ON_COPY_BUN) { @($env:COMMENT_ON_COPY_BUN) } else {
    @('bun.exe', "$env:USERPROFILE\.local\bin\bun.exe", "$env:USERPROFILE\.bun\bin\bun.exe")
}
$runtime = $null
foreach ($candidate in $candidates) {
    $command = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue
    if (-not $command) { continue }
    $version = & $command.Source --version 2>$null
    if ($LASTEXITCODE -eq 0 -and "$version" -match '^(\d+)\.(\d+)\.' -and
        ([int]$Matches[1] -gt 1 -or ([int]$Matches[1] -eq 1 -and [int]$Matches[2] -ge 3))) {
        $runtime = $command.Source
        break
    }
}
if (-not $runtime) {
    [Console]::Error.WriteLine('Comment on Copy requires Bun 1.3.0+. Install Bun or set COMMENT_ON_COPY_BUN to its executable.')
    exit 1
}
$env:PATH = (Split-Path $runtime) + ';' + $env:PATH
Set-Location (Split-Path $PSScriptRoot)
& $runtime run scripts/run.ts @actionArgs
exit $LASTEXITCODE
