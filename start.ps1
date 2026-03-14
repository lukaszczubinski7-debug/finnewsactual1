$ErrorActionPreference = "Stop"

# 1. Migracja bazy danych (synchronicznie)
Write-Host ""
Write-Host ">>> Migracja bazy danych..." -ForegroundColor Cyan
Push-Location backend
uv run alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "BLAD: Migracja nie powiodla sie." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location
Write-Host "    OK" -ForegroundColor Green

# 2. Backend (osobne okno)
Write-Host ">>> Uruchamiam backend na http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Start-Process powershell `
  -WorkingDirectory ".\backend" `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    "uv run uvicorn finnews.main:app --reload --host 127.0.0.1 --port 8000 --app-dir src"

# 3. Frontend (osobne okno)
Write-Host ">>> Uruchamiam frontend na http://localhost:3000 ..." -ForegroundColor Cyan
Start-Process powershell `
  -WorkingDirectory ".\frontend" `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    "npm run dev"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "  Otwierz przegladarke: http://localhost:3000" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "(Backend startuje ~5s, frontend ~10s)" -ForegroundColor Gray
