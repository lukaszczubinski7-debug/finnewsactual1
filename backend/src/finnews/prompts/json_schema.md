Zwracaj wylacznie poprawny JSON.

Dla mode=quick:
{
  "mode": "quick",
  "summary": "string"
}

Dla mode=standard lub mode=extended:
{
  "headline": "string",
  "mode": "standard|extended",
  "items": [
    {"title": "string", "body": "string"}
  ],
  "sources": [
    {
      "title": "string",
      "url": "string",
      "publisher": "string",
      "published_at": "string"
    }
  ]
}

Reguly:
- quick: summary jako jeden akapit 3-6 zdan, bez list, bez sekcji, bez meta-komentarzy.
- quick: kazde zdanie = jeden osobny fakt lub wydarzenie (kto, co, gdzie, kiedy) — nie lacz kilku tematow w jedno zdanie.
- quick: zero opinii, prognoz, interpretacji, konkluzji ani zaleznosci przyczynowo-skutkowych.
- quick: nie uzywaj sformulowan "moze prowadzic do", "moze spowodowac", "budzi niepokoj", "sytuacja pozostaje dynamiczna".
- quick: brak powtorzen — kazdy news tylko raz.
- standard: 3-4 tematy.
- extended: 4-5 tematow.
- Nigdy nie zwracaj wiecej niz 5 tematow.
- Dla standard/extended: kazdy temat ma naturalny tytul i body 2-3 zdania.
- Nie uzywaj pustych ogolnikow ani technicznych slow debug/fallback/upstream.
- Odpowiedz tylko JSON, bez markdown.
