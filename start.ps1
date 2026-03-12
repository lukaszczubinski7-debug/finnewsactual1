$backendCommand = 'uv run uvicorn finnews.main:app --reload --host 127.0.0.1 --port 8000'
$frontendCommand = 'npm run dev'

Start-Process powershell `
  -WorkingDirectory ".\backend" `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $backendCommand

Start-Process powershell `
  -WorkingDirectory ".\frontend" `
  -ArgumentList "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $frontendCommand
