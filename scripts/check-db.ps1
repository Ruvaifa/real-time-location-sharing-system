$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "Checking latest records in Postgres..." -ForegroundColor Cyan

$cmd = @(
  "docker", "compose", "exec", "-T", "db",
  "psql", "-U", "app", "-d", "location_share",
  "-c", "SELECT * FROM users ORDER BY created_at DESC LIMIT 10;",
  "-c", "SELECT * FROM locations ORDER BY created_at DESC LIMIT 20;"
)

& $cmd[0] $cmd[1..($cmd.Length - 1)]
