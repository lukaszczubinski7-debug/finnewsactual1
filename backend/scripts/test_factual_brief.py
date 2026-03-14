"""
Test nowego szablonu faktograficznego briefu (standard/mid).
Uruchomienie: cd backend && uv run python scripts/test_factual_brief.py
"""
from __future__ import annotations

import asyncio
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from finnews.clients.llm import LLMClient

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "src" / "finnews" / "prompts"

SPECULATIVE_PATTERNS = [
    r"\bmoze\b", r"\bmoga\b", r"\bmogl\w*\b", r"\bprawdopodob\w*\b",
    r"\bgroz\w*\b", r"\boczekuj\w*\b", r"\bprzewidu\w*\b", r"\bimplikaC\w*\b",
    r"\bscenariusz\b", r"\bhoryzont\b", r"\banalitycy\b", r"\binwestorzy obaw\w*\b",
    r"\bwplyw na rynk\w*\b", r"\brynki mog\w*\b", r"\bto oznacza\b",
]

SCENARIOS = [
    {
        "name": "1. Geopolityka – Ukraina/Rosja ceasefire talks",
        "sources": [
            {
                "title": "Ukraine, US agree on 30-day ceasefire proposal; Russia demands security guarantees",
                "summary": "Ukraine and the United States have agreed on a 30-day ceasefire proposal submitted to Russia on March 13, 2026. Russia's foreign ministry demanded written security guarantees and withdrawal of NATO forces from eastern flank before any ceasefire. Kyiv rejected the demand for territorial concessions. The talks took place in Riyadh, Saudi Arabia, mediated by Saudi Crown Prince Mohammed bin Salman.",
                "publisher": "Reuters",
                "published_at": "2026-03-13T14:22:00Z",
                "url": "https://reuters.com/world/ukraine-ceasefire-2026",
            },
            {
                "title": "Russia launches 84 drones and 12 missiles at Ukrainian energy infrastructure overnight",
                "summary": "Russian forces launched 84 Shahed drones and 12 Kh-101 cruise missiles overnight March 12-13, targeting power stations in Kharkiv, Zaporizhzhia and Lviv. Ukraine's air defense intercepted 71 drones and 9 missiles. Partial power outages reported in Kharkiv affecting 340,000 residents. Ukraine's Ukrenergo announced emergency repairs expected to take 72 hours.",
                "publisher": "Associated Press",
                "published_at": "2026-03-13T07:10:00Z",
                "url": "https://apnews.com/article/ukraine-russia-drones-2026",
            },
            {
                "title": "European Council emergency session called for March 17 on Ukraine",
                "summary": "EU Council President called an emergency summit for March 17, 2026 in Brussels. Agenda includes EUR 5 billion additional military aid package for Ukraine and coordination of potential peacekeeping force. Germany and France back deployment; Poland and Baltic states demand NATO Article 5 guarantees first.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-13T18:45:00Z",
                "url": "https://bloomberg.com/eu-ukraine-summit",
            },
        ],
        "continents": ["EU"],
        "query": "",
    },
    {
        "name": "2. Makro – Fed decyzja o stopach",
        "sources": [
            {
                "title": "Federal Reserve holds rates at 4.25-4.50%, signals no cuts in 2026",
                "summary": "The Federal Reserve held its benchmark interest rate unchanged at 4.25-4.50% at the March 19, 2026 FOMC meeting, the fourth consecutive hold. Fed Chair Jerome Powell said inflation at 2.8% remains above the 2% target and the labor market added 187,000 jobs in February. The dot plot shows only one cut expected in 2026, down from two projected in December 2025.",
                "publisher": "Reuters",
                "published_at": "2026-03-19T18:00:00Z",
                "url": "https://reuters.com/fed-march-2026",
            },
            {
                "title": "US CPI rose 0.4% in February, above 0.3% forecast; core at 3.1% year-on-year",
                "summary": "US Consumer Price Index rose 0.4% month-on-month in February 2026, beating the consensus estimate of 0.3%. Year-on-year CPI stands at 3.2%. Core CPI, excluding food and energy, rose 0.3% MoM and 3.1% YoY. Shelter costs rose 0.5% MoM, the biggest driver. Energy prices dropped 1.2% MoM.",
                "publisher": "Associated Press",
                "published_at": "2026-03-12T12:30:00Z",
                "url": "https://apnews.com/cpi-february-2026",
            },
            {
                "title": "US 10-year Treasury yield rises to 4.68% after Fed statement",
                "summary": "US 10-year Treasury yield climbed 11 basis points to 4.68% after the Fed statement, the highest since November 2025. 2-year yield rose to 4.41%. The dollar index DXY gained 0.7% to 104.3. S&P 500 futures fell 0.9% in after-hours trading.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-19T20:15:00Z",
                "url": "https://bloomberg.com/fed-yields-march",
            },
        ],
        "continents": ["NA"],
        "query": "polityka monetarna Fed",
    },
    {
        "name": "3. Iran – sankcje i program nuklearny",
        "sources": [
            {
                "title": "US imposes new sanctions on 17 Iranian entities tied to missile program",
                "summary": "The US Treasury Department imposed sanctions on 17 Iranian companies and individuals on March 11, 2026, linked to Iran's ballistic missile and drone programs. Among those sanctioned are 5 firms in the UAE and 3 in Turkey used as procurement intermediaries. Iran's central bank correspondent accounts in 4 European banks are also blocked.",
                "publisher": "Reuters",
                "published_at": "2026-03-11T16:00:00Z",
                "url": "https://reuters.com/iran-sanctions-march-2026",
            },
            {
                "title": "IAEA: Iran enriching uranium to 60% at Fordow, 274 kg stockpile confirmed",
                "summary": "The International Atomic Energy Agency confirmed in a March 10, 2026 report that Iran is enriching uranium to 60% purity at the Fordow facility. Iran's stockpile of 60%-enriched uranium reached 274 kg, up from 182 kg in November 2025. The IAEA noted Iran blocked inspector access to the Natanz centrifuge workshop for 18 days in February.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-10T09:00:00Z",
                "url": "https://bloomberg.com/iaea-iran-report",
            },
            {
                "title": "Iran exports 1.4 million barrels/day of oil in February despite sanctions",
                "summary": "Iran exported approximately 1.4 million barrels per day of crude oil in February 2026, according to tanker-tracking data from Kpler. Most shipments went to China (1.1 mbpd) and smaller volumes to Syria and Venezuela. Oil prices rose $1.80 to $84.60/bbl on Brent after the IAEA report.",
                "publisher": "Reuters",
                "published_at": "2026-03-10T14:30:00Z",
                "url": "https://reuters.com/iran-oil-exports",
            },
        ],
        "continents": ["ME"],
        "query": "Iran",
    },
    {
        "name": "4. Chiny/Tajwan – napięcia militarne",
        "sources": [
            {
                "title": "China conducts largest military exercise near Taiwan in 18 months – 46 warplanes, 12 vessels",
                "summary": "China's People's Liberation Army conducted a two-day military exercise around Taiwan on March 8-9, 2026, deploying 46 warplanes and 12 naval vessels. Taiwan's defense ministry activated 14 fighter jets and 6 frigates in response. The exercise code-named 'Joint Sword-2026A' included simulated blockade drills at Taiwan Strait's northern and southern entries.",
                "publisher": "Reuters",
                "published_at": "2026-03-09T06:00:00Z",
                "url": "https://reuters.com/china-taiwan-drills",
            },
            {
                "title": "Taiwan Semiconductor cuts Q1 revenue guidance by 3% citing geopolitical uncertainty",
                "summary": "Taiwan Semiconductor Manufacturing Company (TSMC) revised its Q1 2026 revenue guidance down by 3% to USD 25.1 billion from USD 25.9 billion, citing increased geopolitical uncertainty and order deferrals from three US clients. TSMC's Arizona facility production schedule was maintained. TSMC shares fell 4.2% in Taipei trading on March 10.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-10T08:20:00Z",
                "url": "https://bloomberg.com/tsmc-guidance",
            },
            {
                "title": "US deploys USS Carl Vinson carrier strike group to Philippine Sea",
                "summary": "The US Navy deployed the USS Carl Vinson carrier strike group to the Philippine Sea on March 9, 2026, joining the USS Ronald Reagan already in the region. The deployment involves two aircraft carriers, 11 additional warships and approximately 14,000 personnel. The Pentagon described it as a 'routine freedom of navigation' operation.",
                "publisher": "Associated Press",
                "published_at": "2026-03-09T21:00:00Z",
                "url": "https://apnews.com/uss-carl-vinson",
            },
        ],
        "continents": ["AS"],
        "query": "",
    },
    {
        "name": "5. OPEC+ – cięcia produkcji",
        "sources": [
            {
                "title": "OPEC+ extends 2.2 million bpd production cuts through June 2026",
                "summary": "OPEC+ agreed at its March 5, 2026 ministerial meeting to extend voluntary production cuts of 2.2 million barrels per day through June 2026, delaying the planned phase-out from April. Saudi Arabia maintained its own additional voluntary cut of 1 million bpd. Iraq and Kazakhstan reported compliance of 76% and 68% respectively in February, below the agreed targets.",
                "publisher": "Reuters",
                "published_at": "2026-03-05T15:00:00Z",
                "url": "https://reuters.com/opec-plus-march-2026",
            },
            {
                "title": "Brent crude rises to $86.40 after OPEC+ announcement; WTI at $83.10",
                "summary": "Brent crude oil futures rose USD 2.10 (2.5%) to USD 86.40 per barrel on March 5, 2026 following the OPEC+ decision. WTI reached USD 83.10. Goldman Sachs raised its 3-month Brent price target to USD 92 from USD 87. IEA estimates total OPEC+ supply shortfall at 800,000 bpd in Q1 2026 due to non-compliance.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-05T17:30:00Z",
                "url": "https://bloomberg.com/brent-opec",
            },
        ],
        "continents": ["ME", "NA"],
        "query": "ropa OPEC",
    },
    {
        "name": "6. US Big Tech – wyniki kwartalne",
        "sources": [
            {
                "title": "Nvidia Q4 FY2026 revenue $39.2B, beats $36.8B estimate; data center up 93% YoY",
                "summary": "Nvidia reported Q4 FY2026 revenue of USD 39.2 billion on February 26, 2026, surpassing the consensus estimate of USD 36.8 billion. Data center segment revenue reached USD 35.6 billion, up 93% year-on-year. Net income was USD 21.1 billion. Q1 FY2027 guidance set at USD 43 billion, above the USD 41.2 billion estimate. Shares rose 8.3% in after-hours trading.",
                "publisher": "Reuters",
                "published_at": "2026-02-26T21:00:00Z",
                "url": "https://reuters.com/nvidia-q4-fy2026",
            },
            {
                "title": "Microsoft cloud revenue grows 21% YoY to $40.9B in Q2 FY2026",
                "summary": "Microsoft reported total Q2 FY2026 revenue of USD 69.6 billion, up 12% year-on-year. Azure and cloud services grew 21% YoY to USD 40.9 billion. Operating income rose 17% to USD 29.4 billion. Microsoft raised its full-year capex guidance to USD 86 billion from USD 80 billion, primarily for AI infrastructure.",
                "publisher": "Bloomberg",
                "published_at": "2026-01-29T21:30:00Z",
                "url": "https://bloomberg.com/microsoft-q2-fy2026",
            },
            {
                "title": "Alphabet Q4 2025 revenue $96.5B; Google Search up 10%; YouTube up 14%",
                "summary": "Alphabet reported Q4 2025 revenue of USD 96.5 billion, up 13% YoY, in line with consensus. Google Search revenue grew 10% to USD 54.0 billion. YouTube advertising revenue rose 14% to USD 10.5 billion. Google Cloud revenue reached USD 12.0 billion, up 30% YoY. Alphabet announced a USD 70 billion share buyback program and a first-ever quarterly dividend of USD 0.20 per share.",
                "publisher": "Reuters",
                "published_at": "2026-02-04T21:15:00Z",
                "url": "https://reuters.com/alphabet-q4-2025",
            },
        ],
        "continents": ["NA"],
        "query": "wyniki spolek technologicznych",
    },
    {
        "name": "7. Polska/GPW – NBP i GPW",
        "sources": [
            {
                "title": "NBP cuts main rate by 50bp to 5.25% – first cut since October 2023",
                "summary": "Poland's Monetary Policy Council cut the main interest rate by 50 basis points to 5.25% at its March 5, 2026 meeting, the first rate reduction since October 2023. Governor Adam Glapinski said CPI fell to 3.4% in February 2026 from 4.7% a year earlier. NBP projects inflation at 2.8% in Q4 2026. The zloty weakened 0.4% to 4.18 EUR/PLN after the decision.",
                "publisher": "Reuters",
                "published_at": "2026-03-05T13:00:00Z",
                "url": "https://reuters.com/nbp-rate-cut",
            },
            {
                "title": "KGHM reports FY2025 net profit of PLN 3.8B, up 42% YoY; copper output 692kt",
                "summary": "KGHM Polska Miedz reported FY2025 net profit of PLN 3.8 billion on March 12, 2026, a 42% year-on-year increase driven by higher copper prices. Copper production reached 692,000 tonnes globally. Revenue grew 18% to PLN 34.2 billion. The board proposed a dividend of PLN 5.50 per share (total PLN 1.06 billion), subject to shareholder vote. KGHM shares rose 3.1% on the Warsaw Stock Exchange.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-12T10:00:00Z",
                "url": "https://bloomberg.com/kghm-results",
            },
            {
                "title": "PKO BP reports PLN 6.1B net profit in FY2025; NIM at 3.84%",
                "summary": "PKO Bank Polski reported FY2025 net profit of PLN 6.1 billion, up 8% year-on-year, announced March 7, 2026. Net interest margin was 3.84%, down from 4.11% in FY2024 due to lower interest rate environment. Total loans grew 9.2% to PLN 278 billion. The bank proposed a dividend of PLN 3.20 per share.",
                "publisher": "Reuters",
                "published_at": "2026-03-07T11:30:00Z",
                "url": "https://reuters.com/pko-bp-results",
            },
        ],
        "continents": ["EU"],
        "query": "Polska GPW banki",
    },
    {
        "name": "8. Handel globalny – cła USA/Chiny",
        "sources": [
            {
                "title": "US raises tariffs on Chinese EVs to 102.5%, steel to 25%; China retaliates",
                "summary": "The United States raised tariffs on Chinese electric vehicles to 102.5% and on Chinese steel and aluminum to 25% effective March 4, 2026, under Section 301 of the Trade Act. The measures cover USD 18 billion in annual imports. China announced retaliatory tariffs of 15% on US soybeans, corn and wheat, and 25% on US pork, effective March 20, 2026. US agricultural exports to China in 2025 totaled USD 26 billion.",
                "publisher": "Reuters",
                "published_at": "2026-03-04T14:00:00Z",
                "url": "https://reuters.com/us-china-tariffs-2026",
            },
            {
                "title": "WTO disputes panel rules against US steel tariffs; US rejects ruling",
                "summary": "The World Trade Organization's dispute panel ruled on March 6, 2026 that the US Section 232 steel tariffs of 25% are inconsistent with WTO obligations. The US Trade Representative's office rejected the ruling, stating national security exemptions are non-justiciable under WTO rules. The ruling affects approximately USD 8 billion in annual steel trade.",
                "publisher": "Associated Press",
                "published_at": "2026-03-06T16:30:00Z",
                "url": "https://apnews.com/wto-us-steel",
            },
            {
                "title": "EU announces EUR 26B countermeasures on US goods following new tariffs",
                "summary": "The European Commission announced EUR 26 billion in countermeasures on US goods on March 12, 2026, in response to US tariffs on European steel and aluminum. Targeted products include motorcycles, bourbon whiskey, orange juice and tobacco products. The measures will take effect April 1, 2026 unless a negotiated solution is reached. This is the largest EU trade response since the 2018 steel tariff dispute.",
                "publisher": "Bloomberg",
                "published_at": "2026-03-12T15:00:00Z",
                "url": "https://bloomberg.com/eu-us-tariffs",
            },
        ],
        "continents": ["NA", "EU", "AS"],
        "query": "cla handel USA Chiny Europa",
    },
]


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


def check_quality(items: list[dict], sources_text: str) -> dict:
    """Prosta ocena jakości – szukamy spekulacji i brak konkretów."""
    all_body = " ".join(item.get("body", "") for item in items).lower()

    speculative_hits = []
    for pattern in SPECULATIVE_PATTERNS:
        matches = re.findall(pattern, all_body, re.IGNORECASE)
        if matches:
            speculative_hits.extend(matches[:2])

    # Policz konkretne: liczby, daty, nazwy własne
    numbers = len(re.findall(r'\b\d[\d,.%$€£]+\b', all_body))
    proper_names_approx = len(re.findall(r'\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\b', " ".join(item.get("body","") for item in items)))

    return {
        "speculative_hits": speculative_hits[:5],
        "numbers_found": numbers,
        "proper_names_approx": proper_names_approx,
        "ok": len(speculative_hits) == 0,
    }


async def run_test(llm: LLMClient, scenario: dict) -> None:
    name = scenario["name"]
    sources = scenario["sources"]
    continents = scenario["continents"]
    query = scenario.get("query", "")

    system_prompt = "\n\n".join([
        load_prompt("system.md"),
        load_prompt("brief.md"),
        load_prompt("json_schema.md"),
        "Zwroc wylacznie JSON, bez markdown.",
    ])

    user_payload = {
        "mode": "mid",
        "continents": continents,
        "question": query,
        "geo_focus": "",
        "window_hours": 24,
        "user_preference_context": "",
        "sources": sources,
    }

    print(f"\n{'='*70}")
    print(f"SCENARIUSZ: {name}")
    print(f"Inputy: {len(sources)} newsy | regiony: {continents} | query: {query!r}")
    print("="*70)

    raw = await llm.complete(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        temperature=0.1,
    )

    try:
        parsed = json.loads(raw)
    except Exception as exc:
        print(f"[BLAD PARSOWANIA JSON]: {exc}")
        print(f"Raw output: {raw[:500]}")
        return

    headline = parsed.get("headline", "")
    items = parsed.get("items", [])
    mode = parsed.get("mode", "?")

    print(f"\nMODE: {mode}")
    print(f"HEADLINE: {headline}")
    print(f"LICZBA BLOKOW: {len(items)}")

    for i, item in enumerate(items, 1):
        title = item.get("title", "")
        body = item.get("body", "")
        print(f"\n  [{i}] {title}")
        print(f"      {body}")

    # Ocena jakosci
    sources_text = " ".join(s.get("title", "") + " " + s.get("summary", "") for s in sources)
    quality = check_quality(items, sources_text)

    print(f"\n  OCENA JAKOSCI:")
    print(f"    Spekulacje znalezione: {quality['speculative_hits'] or 'brak'}")
    print(f"    Liczby/procenty w tresci: {quality['numbers_found']}")
    print(f"    STATUS: {'OK' if quality['ok'] else 'UWAGA – spekulacje!'}")


async def main() -> None:
    llm = LLMClient()
    print("Test faktograficznego briefu standard – 8 scenariuszy")
    print(f"Model: {llm.model}")

    for scenario in SCENARIOS:
        await run_test(llm, scenario)

    print("\n" + "="*70)
    print("Testy zakonczone.")


if __name__ == "__main__":
    asyncio.run(main())
