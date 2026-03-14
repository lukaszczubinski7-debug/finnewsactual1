$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

# Migracja DB
Write-Host ">>> Migracja bazy danych..." -ForegroundColor Cyan
Push-Location $backendDir
uv run alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "BLAD: Migracja nie powiodla sie." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "    OK" -ForegroundColor Green

Start-Process powershell `
  -WorkingDirectory $backendDir `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ".\scripts\run_dev.ps1"

Start-Process powershell `
  -WorkingDirectory $frontendDir `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "npm run dev"

Write-Host ""
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Yellow
