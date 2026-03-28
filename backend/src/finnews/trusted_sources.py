"""Zweryfikowane źródła informacji dla Research Agenta.

Każde źródło ma: nazwę, handle/id, URL, kategorię (X/YT/Bank/Web), tematy.
Trust level (0.0-1.0) w preferencjach użytkownika kontroluje jak często LLM preferuje te źródła.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class VerifiedSource:
    name: str
    handle: str          # @handle dla X, channel_id dla YT, domena dla Web
    url: str
    category: str        # "X" | "YT" | "Bank" | "Web"
    topics: list[str] = field(default_factory=list)
    description: str = ""


# ── Wszystkie zweryfikowane źródła ─────────────────────────────────────────

VERIFIED_SOURCES: list[VerifiedSource] = [

    # ── X (Twitter) ────────────────────────────────────────────────────────
    VerifiedSource(
        name="Mariusz Hojda",
        handle="k0g00t",
        url="https://x.com/k0g00t",
        category="X",
        topics=["giełda polska", "GPW", "akcje PL"],
        description="Analityk i komentator polskiej giełdy (GPW)",
    ),
    VerifiedSource(
        name="M.v. Cunha",
        handle="mvcinvesting",
        url="https://x.com/mvcinvesting",
        category="X",
        topics=["giełda US", "S&P500", "akcje", "inwestycje"],
        description="Inwestor US equity, analiza rynku akcji USA",
    ),
    VerifiedSource(
        name="Agrippa Investment",
        handle="Agrippa_Inv",
        url="https://x.com/Agrippa_Inv",
        category="X",
        topics=["giełda US", "makro", "inwestycje", "komentarze rynkowe"],
        description="US giełda i ogólne komentarze rynkowe",
    ),
    VerifiedSource(
        name="Jurek Tomaszewski",
        handle="JJTomaszewski",
        url="https://x.com/JJTomaszewski",
        category="X",
        topics=["giełda polska", "GPW", "giełda US", "akcje"],
        description="Polska i US giełda — komentarze i analizy",
    ),

    # ── YouTube ────────────────────────────────────────────────────────────
    VerifiedSource(
        name="Good Times Bad Times PL",
        handle="UCTTzMDoVCbaX6K1CwKsRJsQ",
        url="https://www.youtube.com/channel/UCTTzMDoVCbaX6K1CwKsRJsQ",
        category="YT",
        topics=["makro", "gospodarka", "inwestycje", "rynki finansowe"],
        description="Kanał analityczny — makroekonomia i rynki finansowe",
    ),
]


# ── Helpery ────────────────────────────────────────────────────────────────

def get_sources_by_category(category: str) -> list[VerifiedSource]:
    return [s for s in VERIFIED_SOURCES if s.category == category]


def get_x_handles() -> list[str]:
    """Zwraca listę handli @Twitter dla źródeł kategorii X."""
    return [s.handle for s in VERIFIED_SOURCES if s.category == "X"]


def build_x_from_filter() -> str:
    """Buduje fragment query Twitter: (from:handle1 OR from:handle2 ...)."""
    handles = get_x_handles()
    if not handles:
        return ""
    return "(" + " OR ".join(f"from:{h}" for h in handles) + ")"


def apply_trust_to_query(base_query: str, trust_level: float) -> str:
    """
    Modyfikuje zapytanie Twitter na podstawie poziomu zaufania do źródeł.

    trust_level = 0.0 → zapytanie bez zmian (swobodne szukanie)
    trust_level = 0.5 → preferuje zweryfikowane, ale nie wyklucza innych
    trust_level = 1.0 → szuka wyłącznie wśród zweryfikowanych
    """
    if trust_level <= 0.0:
        return base_query

    from_filter = build_x_from_filter()
    if not from_filter:
        return base_query

    if trust_level >= 1.0:
        # Tylko zweryfikowane źródła
        return f"({base_query}) {from_filter}"
    else:
        # Częściowe preferencje — dodaj filter jako OR-boost
        # Wciąż zwraca ogólne wyniki, ale w opisie systemu LLM dostaje wskazówkę
        return base_query


def get_sources_context_for_prompt(trust_level: float) -> str:
    """Generuje fragment system prompt o zweryfikowanych źródłach."""
    if trust_level <= 0.0:
        return ""

    x_sources = get_sources_by_category("X")
    yt_sources = get_sources_by_category("YT")

    lines = ["## Zweryfikowane źródła (preferuj je)"]

    if x_sources:
        lines.append("\n**X (Twitter):**")
        for s in x_sources:
            lines.append(f"- @{s.handle} ({s.name}) — {s.description}")

    if yt_sources:
        lines.append("\n**YouTube:**")
        for s in yt_sources:
            lines.append(f"- {s.name} — {s.description}")

    if trust_level >= 1.0:
        lines.append(
            "\nPRIORYTET: Korzystaj WYŁĄCZNIE z powyższych zweryfikowanych źródeł. "
            "Ignoruj inne tweety i kanały."
        )
    elif trust_level >= 0.5:
        lines.append(
            f"\nPREFERENCJE: Mocno preferuj powyższe zweryfikowane źródła (poziom zaufania: {trust_level:.0%}). "
            "Gdy wywołujesz search_twitter, priorytetyzuj tweety od tych autorów."
        )
    else:
        lines.append(
            f"\nWSKAZÓWKA: Preferuj powyższe zweryfikowane źródła (poziom zaufania: {trust_level:.0%}). "
            "Możesz korzystać też z innych źródeł."
        )

    return "\n".join(lines)
