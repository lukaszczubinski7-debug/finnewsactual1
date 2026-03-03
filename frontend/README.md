# Fin News Agent Frontend

Frontend MVP built on Next.js App Router. It exposes a brief generation form, calls the backend `POST /brief` endpoint, shows loading and errors, renders the resulting brief, and lets you inspect or download the raw JSON response.

## Environment

Create `frontend/.env` and define:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

You can also copy the template from `.env.example`.

The frontend uses a Next.js rewrite from `/api/:path*` to `${NEXT_PUBLIC_API_BASE_URL}/:path*`, so the browser sends requests to `/api/brief` and does not require CORS configuration in local development.

## Run in two PowerShell windows

Backend window:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend window:

```powershell
npm i
npm run dev
```

Default frontend URL:

```text
http://localhost:3000
```

If your backend entrypoint differs, adjust the module path but keep the same host and port as the frontend env variable.

## MVP features

- Form fields: `region`, `tickers`, `query`, `list_limit`, `select_k`, `summary_k`, `style`
- Client-side `POST /brief` call with JSON body and 30 second timeout
- Loading state and readable API/network/timeout error handling
- Rendered `Brief` output with preserved line breaks
- `Raw JSON` toggle
- `Copy brief` button
- `Download JSON` button
