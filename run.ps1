$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$node = $null

if ($nodeCommand) {
  $node = $nodeCommand.Source
}

if (-not $node) {
  $node = "C:\Users\tejaj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  $nodeModules = "C:\Users\tejaj\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"

  if (-not (Test-Path $node)) {
    throw "Node.js was not found on PATH, and bundled Node.js was not found at $node"
  }

  $env:NODE_PATH = $nodeModules
}

Set-Location $root
Write-Host "Starting Naukri Automachine Daemon..."
Write-Host "The daemon picks up queued runs from the dashboard at http://localhost:3000"
& $node ".\src\daemon.js"
