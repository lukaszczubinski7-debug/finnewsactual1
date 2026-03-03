# Fin News Agent (MVP)

Pipeline:
1) Axesso Yahoo Finance: list news
2) Python normalize (no LLM)
3) LLM selects top-K (optional)
4) Axesso: details for selected
5) Python normalize details (HTML -> text)
6) LLM writes brief

## Axesso authorization setup

Set `AXESSO_API_KEY` and configure header/prefix based on your Axesso account setup:

- Direct Axesso (works with `api.axesso.de`):
  - `AXESSO_AUTH_MODE=direct`
  - `AXESSO_BASE_URL=https://api.axesso.de/yho`
  - `AXESSO_API_KEY_HEADER=axesso-api-key`
  - `AXESSO_API_KEY_PREFIX=`
  - `AXESSO_DEBUG=true`
- Recommended for Azure APIM:
  - `AXESSO_API_KEY_HEADER=Ocp-Apim-Subscription-Key`
  - `AXESSO_API_KEY_PREFIX=`
  - `AXESSO_TRY_SUBSCRIPTION_KEY_PARAM=true` to also try `?subscription-key=...` fallback
- `apikey` header:
  - `AXESSO_API_KEY_HEADER=apikey`
  - `AXESSO_API_KEY_PREFIX=`
- `x-api-key` header:
  - `AXESSO_API_KEY_HEADER=x-api-key`
  - `AXESSO_API_KEY_PREFIX=`
- `Authorization: Bearer <key>`:
  - `AXESSO_API_KEY_HEADER=Authorization`
  - `AXESSO_API_KEY_PREFIX=Bearer `

Debug mode:

- `AXESSO_DEBUG=true` enables request diagnostics (URL, status code, header name, masked API key prefix only).
- Run auth diagnosis: `curl http://127.0.0.1:8000/axesso/diagnose`
- If diagnosis finds a working header, copy `working.example_env` values into `backend/.env`.
- If upstream still returns Azure APIM `missing subscription key`, set `AXESSO_TRY_SUBSCRIPTION_KEY_PARAM=true` to test query-param fallback.

## Backend dev run

From `backend/`, start the development server with:

```powershell
.\scripts\run_dev.ps1
```

The wrapper keeps the console in UTF-8 and runs:

```powershell
uv run uvicorn finnews.main:app --reload --reload-exclude .venv --host 127.0.0.1 --port 8000
```
