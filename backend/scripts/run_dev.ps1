chcp 65001 > $null
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

uv run uvicorn finnews.main:app --reload --reload-exclude .venv --host 127.0.0.1 --port 8000
