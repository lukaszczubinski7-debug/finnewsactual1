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

# 2. Backend + frontend (dev.ps1)
Write-Host ">>> Uruchamiam backend i frontend..." -ForegroundColor Cyan
& .\dev.ps1

Write-Host ""
Write-Host "==========================================" -ForegroundColor Yellow
Write-Host "  Otwierz przegladarke: http://localhost:3000" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Yellow
