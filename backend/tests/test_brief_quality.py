from __future__ import annotations

from finnews.services.brief_service import (
    PROMPT_SHORT_RISK,
    PROMPT_SHORT_TRADER,
    _build_fallback_summary,
    _normalize_unified_summary,
    _prompt_template_name_for_style,
    _validate_quick_summary,
    build_brief_context,
    score_brief_quality,
)


def test_normalize_unified_summary_returns_mode_and_items() -> None:
    result = _normalize_unified_summary(
        {
            "headline": "Test",
            "thesis": "Kluczowy sygnal ryzyka.",
            "facts": ["Fakt 1", "Fakt 2"],
            "analysis": "Implikacja rynkowa.",
            "confidence": {"level": "medium", "reason": "Czesciowe potwierdzenia."},
            "scenarios": {"base": "Baza", "upside_risk": "Up", "downside_risk": "Down"},
            "market_impact": [{"asset": "Ropa", "direction": "positive", "why": "Ryzyko podaży."}],
            "watchlist": ["OPEC", "USD", "Shipping"],
            "sources": [],
        },
        fallback_message="fallback",
        style="mid",
        geo_focus="Bliski Wschod",
        continents=["ME", "EU"],
        query=None,
    )
    assert result["mode"] == "standard"
    assert isinstance(result["items"], list)
    assert 3 <= len(result["items"]) <= 4
    assert all("title" in item and "body" in item for item in result["items"])


def test_fallback_summary_avoids_technical_wording() -> None:
    fallback = _build_fallback_summary(
        style="short",
        geo_focus="Bliski Wschod",
        query="Ropa i FX",
        continents=["ME", "EU"],
        window_hours=72,
        reason="any",
    )
    text = " ".join(
        [
            fallback.get("headline", ""),
            fallback.get("thesis", ""),
            fallback.get("analysis", ""),
            " ".join(fallback.get("facts", [])),
            " ".join(fallback.get("watchlist", [])),
        ]
    ).lower()
    assert "axesso" not in text
    assert "upstream" not in text
    assert "fallback" not in text
    assert "debug" not in text


def test_quality_score_requires_items() -> None:
    poor = {"headline": "X", "mode": "standard", "items": []}
    good = {
        "headline": "Ropa pod presja geopolityczna",
        "mode": "standard",
        "items": [
            {
                "title": "Energia zostaje pod presja geopolityczna",
                "body": "Premia ryzyka rosnie. Najmocniej reaguja ropa i gaz.",
            },
            {
                "title": "Akcje pozostaja wrazliwe na koszty paliw i sentyment",
                "body": "Wzrost niepewnosci podnosi zmiennosc. Decyduja potwierdzone sygnaly eskalacji.",
            },
            {
                "title": "Tempo potwierdzen informacji pozostaje kluczowe",
                "body": "Oficjalne komunikaty beda glownym triggerem. Brak potwierdzen ogranicza trwalosc ruchu.",
            },
        ],
    }
    assert score_brief_quality(poor) < 75
    assert score_brief_quality(good) >= 75


def test_preference_context_changes_short_template() -> None:
    assert _prompt_template_name_for_style("short", preference_context="trader, FX") == PROMPT_SHORT_TRADER
    assert _prompt_template_name_for_style("short", preference_context="risk committee") == PROMPT_SHORT_RISK


def test_quick_mode_normalizes_to_single_summary() -> None:
    result = _normalize_unified_summary(
        {
            "mode": "quick",
            "summary": "Eskalacja ryzyka podbija premie za ryzyko na ropie i FX. Moze to podnosic presje kosztowa na spolki wrazliwe na energie.",
            "sources": [],
        },
        fallback_message="fallback",
        style="short",
        geo_focus="Bliski Wschod",
        continents=["ME"],
        query="ropa i FX",
        preference_context="Interesujace aktywa: ropa, USD/PLN",
    )
    assert result["mode"] == "quick"
    assert isinstance(result["summary"], str)
    assert result["summary"]
    assert "moze" not in result["summary"].casefold()
    assert 1 <= len(result["summary"].split(".")) <= 4
    assert set(result.keys()) == {"mode", "summary"}


def test_quick_mode_falls_back_to_source_titles_when_summary_is_interpretive() -> None:
    result = _normalize_unified_summary(
        {
            "mode": "quick",
            "summary": "Rynek moze reagowac wzrostami. To moze wplynac na energie.",
        },
        fallback_message="fallback",
        style="short",
        geo_focus="Bliski Wschod",
        continents=["ME"],
        query="ropa i FX",
        sources=[
            {
                "title": "Ropa wzrosla po nowych doniesieniach o zakloceniach transportu",
                "provider": "Reuters",
                "published_at": "2026-03-08T10:00:00Z",
                "url": "https://example.com/1",
            }
        ],
    )
    assert result["mode"] == "quick"
    assert "moze" not in result["summary"].casefold()
    assert "Ropa wzrosla" in result["summary"]


def test_build_brief_context_priority_question_over_profile_and_regions() -> None:
    context = build_brief_context(
        user_question="Jak sytuacja wplywa na WIG20?",
        user_preferences=(
            "Profil wyszukiwania: energia i banki\n"
            "Preferowany styl odpowiedzi: formalnie\n"
            "Interesujace aktywa: WIG20, PKO.WA"
        ),
        selected_regions=["EU", "ME"],
        mode="short",
    )
    assert context["primary_question"] == "Jak sytuacja wplywa na WIG20?"
    assert context["main_focus"] == "Jak sytuacja wplywa na WIG20?"
    assert context["response_style"] == "formalnie"
    assert "WIG20" in context["ranking_hints"]


def test_build_brief_context_fallback_to_profile_then_regions() -> None:
    from_profile = build_brief_context(
        user_question="",
        user_preferences="Profil wyszukiwania: rynek energii w Europie",
        selected_regions=["EU"],
        mode="mid",
    )
    assert from_profile["main_focus"] == "rynek energii w Europie"

    from_regions = build_brief_context(
        user_question="",
        user_preferences="",
        selected_regions=["ME", "EU"],
        mode="mid",
    )
    assert from_regions["main_focus"].startswith("Regiony:")


def test_validate_quick_summary_rejects_meta_phrases() -> None:
    assert not _validate_quick_summary(
        "Pytanie inwestycyjne: GPW. Horyzont: 72h.",
        sources=[{"title": "Ropa wzrosla po nowych doniesieniach", "summary": ""}],
        user_inputs=["GPW", "72h"],
    )


def test_validate_quick_summary_rejects_plain_user_input_paraphrase() -> None:
    assert not _validate_quick_summary(
        "Akcje GPW szczegolnie WIG40 i WIG80 sa tematem analizy.",
        sources=[{"title": "Ropa wzrosla po nowych doniesieniach o dostawach", "summary": ""}],
        user_inputs=["Akcje GPW szczegolnie WIG40 i WIG80"],
    )
