Zwracaj wylacznie poprawny JSON.

Dla mode=quick:
{
  "mode": "quick",
  "summary": "string"
}

Dla mode=standard lub mode=extended:
{
  "headline": "string",
  "key_takeaway": "string — 1 zdanie: najwazniejszy fakt/wniosek dnia dla inwestora",
  "mode": "standard|extended",
  "items": [
    {
      "title": "string",
      "body": "string (2-3 zdania faktow)",
      "source_tag": "verified|official|media",
      "source_name": "string — nazwa zrodla, np. 'Mariusz Hojda (@k0g00t)', 'Reuters', 'Bloomberg'"
    }
  ],
  "verified_sources_used": ["string — nazwy zweryfikowanych zrodel uzytych w briefie; pusta lista jesli brak"],
  "sources": [
    {
      "title": "string",
      "url": "string",
      "publisher": "string",
      "published_at": "string"
    }
  ]
}

WAZNE — dla standard/extended zwracaj TYLKO: headline, key_takeaway, mode, items, verified_sources_used, sources.
NIE zwracaj: thesis, facts, analysis, confidence, scenarios, market_impact, watchlist, geopolitical_context.
Te pola sa ZABRONIONE w odpowiedzi.
Kazdy item MUSI miec: title, body, source_tag, source_name.
source_tag: "verified" = z verified_sources, "official" = agencja/komunikat, "media" = ogolne media.

Reguly:
- quick: summary jako jeden akapit 3-6 zdan, bez list, bez sekcji, bez meta-komentarzy.
- quick: kazde zdanie = jeden osobny fakt lub wydarzenie (kto, co, gdzie, kiedy) — nie lacz kilku tematow w jedno zdanie.
- quick: zero opinii, prognoz, interpretacji, konkluzji ani zaleznosci przyczynowo-skutkowych.
- quick: nie uzywaj sformulowan "moze prowadzic do", "moze spowodowac", "budzi niepokoj", "sytuacja pozostaje dynamiczna".
- quick: brak powtorzen — kazdy news tylko raz.
- standard: 3-4 tematy w items.
- extended: 4-5 tematow w items.
- Nigdy nie zwracaj wiecej niz 5 tematow.
- Dla standard/extended: kazdy item ma title, body (2-3 zdania z konkretami), source_tag i source_name.
- key_takeaway: WYMAGANE — zawsze 1 zdanie z najwazniejszym faktem dnia — konkret z liczbami. Nie pomijaj tego pola.
- verified_sources_used: lista nazw zrodel z pola verified_sources ktore faktycznie wykorzystales. Jesli nie uzyto — zwroc pusta tablice [].
- source_tag i source_name: WYMAGANE w kazdym item. Jesli informacja pochodzi z verified_sources — source_tag="verified". Jesli z agencji (Reuters/AP/Bloomberg) — "official". Reszta — "media".
- Nie uzywaj pustych ogolnikow ani technicznych slow debug/fallback/upstream.
- Odpowiedz tylko JSON, bez markdown.
