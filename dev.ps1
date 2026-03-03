Start-Process powershell -WorkingDirectory ".\backend" `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"uv run python -m uvicorn finnews.main:app --reload --host 127.0.0.1 --port 8000 --app-dir src`""

Start-Process powershell -WorkingDirectory ".\frontend" `
  -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"npm run dev`""

Write-Host ""
Write-Host "==================================="
Write-Host "UI: http://localhost:3000"
Write-Host "==================================="
