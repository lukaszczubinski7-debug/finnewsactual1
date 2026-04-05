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

1. (Research) Użytkownik wpisuje pytanie → `postResearch()` → `POST /api/research`
2. Backend wywołuje OpenAI z tool calling → LLM dobiera narzędzia (search_web, get_market_data, get_youtube_transcript, fetch_webpage) → wykonuje je → LLM syntetyzuje odpowiedź po polsku
3. Dla danych rynkowych: frontend → `/api/market/quotes` (proxy) → backend `/market/quotes` → yfinance
4. (YouTube) Użytkownik dodaje film → transkrypcja przez youtube-transcript-api → podsumowanie LLM

### Zakładki frontendowe

`ActiveTab = "centrum" | "dashboard"` — usunięto oddzielną zakładkę "zrodla"

- **Centrum informacji** (ActiveTab: "centrum") — CentrumSubTab: "briefy" | "zrodla":
  - Sub-zakładka **Briefy**:
    - StructuredBriefsPanel — 3 briefy strukturyzowane (Geopolityka / Makro / Tech)
    - ResearchPanel — textarea + wyniki z tool calling (bez przycisku "Aktualna sytuacja")
    - ThreadsPanel na prawej kolumnie (dla zalogowanych)
  - Sub-zakładka **Zweryfikowane Źródła** (SourcesSettingsPanel):
    - Suwak zaufania (trust level 0–1)
    - 19 kont X + 5 kanałów YT + 15 instytucji (PL/EU/US) pogrupowanych
- **Dashboard** (ActiveTab: "dashboard"): dashboard rynkowy z 8 kategoriami:
  - Indeksy (14), Obligacje (4), Surowce (11), Waluty (8), Krypto (9), ETF (12), Akcje GPW (15), Akcje US (15)

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
| `/youtube/sources` | GET / POST | Bearer | Lista filmów / dodaj film |
| `/youtube/sources/{id}` | DELETE | Bearer | Usuń film |
| `/youtube/channels` | GET / POST | Bearer | Lista kanałów / dodaj kanał |
| `/youtube/channels/{id}` | DELETE | Bearer | Usuń kanał |
| `/youtube/channels/refresh` | POST | Bearer | Pobierz nowe filmy ze wszystkich kanałów |
| `/research` | POST | — | Research z LLM tool calling (search_web, get_market_data, get_youtube_transcript, fetch_webpage) |

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

93 instrumentów w 8 kategoriach (25 defaultowych):

- **Indeksy (14):** ^GSPC*, ^IXIC*, ^DJI*, ^GDAXI*, WIG20.WA*, ^FTSE, ^N225, ^HSI, ^STOXX50E, ^CAC40, ^RUT, ^VIX, ^BVSP, ^NSEI
- **Obligacje (4):** ^TNX*, ^TYX*, ^FVX, ^IRX
- **Surowce (11):** GC=F*, CL=F*, SI=F, BZ=F, NG=F, HG=F, PA=F, PL=F, ZC=F, ZW=F, ZS=F
- **Waluty (8):** EURUSD=X*, USDJPY=X*, USDPLN=X*, EURPLN=X*, GBPUSD=X, USDCHF=X, AUDUSD=X, USDCNH=X
- **Krypto (9):** BTC-USD*, ETH-USD*, SOL-USD, BNB-USD, XRP-USD, DOGE-USD, ADA-USD, AVAX-USD, DOT-USD
- **ETF (12):** SPY, QQQ, IWM, GLD, TLT, EEM, VNQ, HYG, AGG, VTI, ARKK, GDXJ
- **Akcje GPW (15):** PKN.WA*, CDR.WA*, PKO.WA*, PZU.WA*, KGHM.WA*, LPP.WA, ALE.WA, MBK.WA, DNP.WA, PEO.WA, OPL.WA, JSW.WA, PGE.WA, XTB.WA, CPS.WA
- **Akcje US (15):** AAPL*, MSFT*, NVDA*, GOOGL*, TSLA*, AMZN, META, NFLX, JPM, V, BRK-B, COIN, PLTR, ORCL, AMD

(*) = default. Źródło: yfinance. Cache TTL 60s. Akcje .WA — dane GPW w PLN.
Użytkownik może spersonalizować listę — zapisuje się w `user_preferences.market_tickers`.
