# FinNews — instrukcje dla Claude

> **WAŻNE:** Po każdej istotnej zmianie w projekcie zaktualizuj ten plik — architekturę, endpointy, zmienne, nowe komponenty.

---

## Uruchomienie lokalne

```powershell
cd C:\Users\Administrator\finnewsactual1\backend; uv run alembic upgrade head; cd C:\Users\Administrator\finnewsactual1; .\dev.ps1
```

Najpierw uruchamia migracje Alembic, potem otwiera dwa okna PowerShell: backend na porcie 8000 i frontend na porcie 3000.

- Frontend: http://localhost:3000
- Backend API: http://127.0.0.1:8000
- Docs (Swagger): http://127.0.0.1:8000/docs

**Nigdy nie używaj `.\start.ps1`** — jedyna poprawna komenda startowa to powyższa.

---

## Architektura

```
finnewsactual1/
├── backend/                    # FastAPI + Python 3.11
│   ├── src/finnews/
│   │   ├── api/                # Endpointy HTTP (routes_*.py)
│   │   ├── clients/            # Klienty zewnętrznych serwisów (axesso, serper, market)
│   │   ├── db/                 # SQLAlchemy session, base, dependencies
│   │   ├── middleware/         # usage_limits.py (limity dzienne)
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── normalizers/        # Normalizatory danych z zewnętrznych API
│   │   ├── schemas/            # Pydantic schemas (walidacja request/response)
│   │   ├── services/           # Logika biznesowa
│   │   ├── utils/              # Pomocnicze funkcje
│   │   ├── main.py             # Punkt wejścia FastAPI, CORS, rejestracja routerów
│   │   ├── settings.py         # Konfiguracja przez zmienne środowiskowe (pydantic-settings)
│   │   ├── security.py         # JWT, haszowanie haseł
│   │   └── scheduler.py        # APScheduler — automatyczne odświeżanie wątków (06:00 UTC)
│   ├── alembic/                # Migracje bazy danych
│   │   └── versions/           # Pliki migracji (format: YYYYMMDD_NN_opis.py)
│   ├── Dockerfile
│   ├── railway.json
│   └── pyproject.toml
│
└── frontend/                   # Next.js 15 (App Router) + TypeScript
    └── src/
        ├── app/
        │   ├── page.tsx        # Główna strona — tab bar, cały state aplikacji
        │   └── api/            # Proxy routes do backendu (market/quotes, market/instruments)
        ├── components/         # Komponenty React
        │   ├── MarketDashboard.tsx      # Dashboard rynkowy — grid kart, auto-refresh
        │   ├── MarketCard.tsx           # Karta jednego instrumentu finansowego
        │   ├── MarketPersonalizeModal.tsx # Modal wyboru instrumentów
        │   ├── ThreadsPanel.tsx         # Panel wątków pamięci
        │   ├── ThreadDetail.tsx         # Szczegóły wątku (modal)
        │   ├── AuthProfilePanel.tsx     # Logowanie, rejestracja, profil
        │   ├── BriefResult.tsx          # Wynik generowania briefu
        │   ├── AnalysisPanel.tsx        # Panel wpisywania zapytania
        │   ├── HeaderBar.tsx            # Nagłówek aplikacji
        │   └── ...
        └── lib/
            ├── api.ts          # Wszystkie funkcje fetch do backendu
            ├── types.ts        # Typy TypeScript (BriefResponse, Thread, MarketQuote, itd.)
            └── briefDefaults.ts
```

### Przepływ danych

1. Użytkownik wpisuje pytanie → `postBrief()` → `POST /api/brief`
2. Frontend proxy (`/app/api/brief/route.ts`) → backend `POST /brief`
3. Backend pobiera newsy (Axesso + Serper), przetwarza przez LLM (OpenAI), zwraca brief
4. Dla danych rynkowych: frontend → `/api/market/quotes` (proxy) → backend `/market/quotes` → yfinance

---

## Endpointy backendu

| Endpoint | Metoda | Auth | Opis |
|---|---|---|---|
| `/health` | GET | — | Healthcheck dla Railway |
| `/brief` | POST | opcjonalny | Generuj brief geopolityczny |
| `/auth/register` | POST | — | Rejestracja użytkownika |
| `/auth/login` | POST | — | Logowanie, zwraca JWT |
| `/auth/me` | GET / DELETE | Bearer | Dane zalogowanego / usuń konto |
| `/profile/preferences` | GET / PUT / PATCH | Bearer | Preferencje użytkownika |
| `/threads` | GET / POST | Bearer | Lista wątków / utwórz wątek |
| `/threads/{id}/refresh` | POST | Bearer | Odśwież wątek |
| `/threads/refresh-all` | POST | Bearer | Odśwież wszystkie wątki |
| `/threads/suggest` | POST | Bearer | AI sugeruje nowy wątek na podstawie briefu |
| `/threads/{id}` | DELETE | Bearer | Usuń wątek |
| `/market/quotes` | GET | — | Live ceny instrumentów (yfinance, cache 60s) |
| `/market/instruments` | GET | — | Lista dostępnych instrumentów wg kategorii |

---

## Baza danych

Alembic + SQLAlchemy. Migracje w `backend/alembic/versions/`.

| Tabela | Opis |
|---|---|
| `users` | Konta użytkowników (email, hashed_password, is_active) |
| `user_preferences` | Preferencje użytkownika (profil, zainteresowania, market_tickers) |
| `threads` | Wątki pamięci geopolitycznej |
| `usage_log` | Logi użycia (limity dzienne) |

Migracje uruchamiają się automatycznie przy starcie Dockera: `alembic upgrade head`.

Lokalnie SQLite (`finnews.db`), produkcja PostgreSQL (Railway).

---

## Zmienne środowiskowe

Plik `backend/.env` (lokalnie). Na Railway/Vercel ustawiane w panelu.

### Backend (Railway)

```env
# Wymagane w produkcji
DATABASE_URL=postgresql://...          # Auto z Railway PostgreSQL plugin
JWT_SECRET_KEY=losowy-ciag-znakow      # Minimum 32 znaki, losowy
OPENAI_API_KEY=sk-...                  # Klucz OpenAI
AXESSO_API_KEY=...                     # Klucz Axesso (newsy)
SERPER_API_KEY=...                     # Klucz Serper (Google News)

# CORS
ALLOWED_ORIGINS=https://finnewsactual1-flame.vercel.app

# Opcjonalne
APP_ENV=production
DAILY_BRIEF_LIMIT=0                    # 0 = bez limitu
DAILY_THREAD_REFRESH_LIMIT=0
SCHEDULER_ENABLED=true                 # Automatyczne odświeżanie wątków
SCHEDULER_REFRESH_CRON=0 6 * * *       # Codziennie 06:00 UTC
OPENAI_MODEL=gpt-4.1-mini
```

### Frontend (Vercel)

```env
API_BASE_URL=https://finnewsactual1-production.up.railway.app
```

---

## Konwencje kodu

### Backend (Python)
- **Styl:** PEP 8, `from __future__ import annotations` w każdym pliku
- **Schematy:** Pydantic v2 — osobne pliki w `schemas/`
- **Modele ORM:** `Mapped[typ]` z SQLAlchemy 2.0 — w `models/`
- **Logika biznesowa:** w `services/`, nie bezpośrednio w endpointach
- **Klienty zewnętrzne:** w `clients/` (jeden plik = jeden serwis)
- **Migracje:** format nazwy `YYYYMMDD_NN_opis_co_robi.py`
- **Cache:** `cachetools.TTLCache` dla danych rynkowych (60s)

### Frontend (TypeScript / Next.js)
- **Komponenty:** `"use client"` na górze jeśli używają hooks/state
- **Typy:** wszystkie w `src/lib/types.ts`
- **API calls:** wszystkie w `src/lib/api.ts`
- **Stylowanie:** inline styles (brak Tailwind/CSS-in-JS) + CSS Modules dla istniejących paneli
- **State:** React hooks w `page.tsx` (jeden główny komponent z logiką)
- **Proxy routes:** `src/app/api/*` — przekazują requesty do backendu (ukrywają `API_BASE_URL`)
- **Bez zmian w istniejącym CSS** jeśli nie jest to konieczne

---

## Wdrożenie

- **Frontend:** Vercel — auto-deploy po push do `main` → https://finnewsactual1-flame.vercel.app
- **Backend:** Railway — auto-deploy po push do `main` → https://finnewsactual1-production.up.railway.app
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) — pytest + `npm run build`

---

## Notatki projektowe

Dodatkowe notatki i kontekst projektu są w dwóch miejscach:

1. **Notion** — ogólne notatki projektowe
2. **Folder w Notion: `AI / Project Brief`** — szczegółowe notatki dotyczące funkcjonalności, decyzji architektonicznych i planów rozwoju

---

## Instrumenty rynkowe (dashboard)

48 instrumentów domyślnych w 6 kategoriach:

- **Indeksy:** ^GSPC, ^IXIC, ^DJI, ^GDAXI, WIG20.WA, ^FTSE, ^N225, ^HSI, ^STOXX50E, ^CAC40, ^SP500TR, ^RUT
- **Obligacje:** ^TNX, ^TYX, ^FVX, ^IRX
- **Surowce:** GC=F, SI=F, CL=F, BZ=F, NG=F, HG=F, ZC=F, ZW=F
- **Waluty:** EURUSD=X, GBPUSD=X, USDJPY=X, USDPLN=X, EURPLN=X, USDCHF=X, AUDUSD=X, USDCNH=X
- **Krypto:** BTC-USD, ETH-USD, SOL-USD, BNB-USD, XRP-USD, DOGE-USD
- **ETF:** SPY, QQQ, IWM, GLD, TLT, EEM, VNQ, HYG

Źródło: yfinance (gratis, ~15 min opóźnienie dla giełd). Cache TTL 60s.
Użytkownik może spersonalizować listę — zapisuje się w `user_preferences.market_tickers`.
