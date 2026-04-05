"""Zweryfikowane źródła informacji dla Research Agenta.

Każde źródło ma: nazwę, handle/id, URL, kategorię (X/YT/Bank/Web/Instytucja), tematy, grupę.
source_weights: dict[handle, float 0.0-1.0] — waga każdego źródła.
  0.0 = wyłączone, 1.0 = najwyższy priorytet, brak wpisu = 1.0 (domyślnie włączone)
Global trust_level (0.0-1.0) kontroluje ogólny tryb działania LLM.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class VerifiedSource:
    name: str
    handle: str          # @handle dla X, channel_id dla YT, domain dla Web
    url: str
    category: str        # "X" | "YT" | "Bank" | "Web" | "Instytucja"
    topics: list[str] = field(default_factory=list)
    description: str = ""
    is_default: bool = True
    group: str = ""      # "ai", "tech", "macro", "geo", "gpw"


DEFAULT_SOURCES: list[VerifiedSource] = [
    # ══════════════════════════════════════════════════════════════════════════
    # AI & TECH — konta X śledzące AI, startupy, nowe produkty
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="Yann LeCun",
        handle="ylecun",
        url="https://x.com/ylecun",
        category="X",
        topics=["AI", "deep learning", "Meta AI", "machine learning"],
        description="Chief AI Scientist @ Meta, pionier deep learning",
        group="ai",
    ),
    VerifiedSource(
        name="Jim Fan",
        handle="DrJimFan",
        url="https://x.com/DrJimFan",
        category="X",
        topics=["AI", "Nvidia", "robotyka", "foundation models"],
        description="Senior Research Scientist @ Nvidia, AI+robotyka",
        group="ai",
    ),
    VerifiedSource(
        name="Emad Mostaque",
        handle="EMostaque",
        url="https://x.com/EMostaque",
        category="X",
        topics=["AI", "open source AI", "generative AI"],
        description="AI entrepreneur, komentator open-source AI",
        group="ai",
    ),
    VerifiedSource(
        name="Ethan Mollick",
        handle="emollick",
        url="https://x.com/emollick",
        category="X",
        topics=["AI", "LLM", "produktywność AI", "edukacja"],
        description="Profesor Wharton, praktyczne zastosowania AI",
        group="ai",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # TECHNOLOGIA (szeroko) — hardware, software, startupy, VC
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="Benedict Evans",
        handle="benedictevans",
        url="https://x.com/benedictevans",
        category="X",
        topics=["tech", "startupy", "VC", "trendy technologiczne"],
        description="Analityk technologiczny, były a16z, newsletter tech",
        group="tech",
    ),
    VerifiedSource(
        name="TechCrunch",
        handle="TechCrunch",
        url="https://x.com/TechCrunch",
        category="X",
        topics=["startupy", "VC", "funding", "IPO", "tech news"],
        description="Główne źródło newsów o startupach i finansowaniu",
        group="tech",
    ),
    VerifiedSource(
        name="The Verge",
        handle="veraborea",
        url="https://x.com/verge",
        category="X",
        topics=["tech", "gadżety", "software", "gaming", "nauka"],
        description="Newsy technologiczne, produkty, recenzje",
        group="tech",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # MAKRO — instytucje, banki centralne, ekonomiści
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="Federal Reserve",
        handle="federalreserve",
        url="https://www.federalreserve.gov/",
        category="Instytucja",
        topics=["Fed", "stopy procentowe", "polityka monetarna", "USD"],
        description="Bank centralny USA — komunikaty, decyzje, dane",
        group="macro",
    ),
    VerifiedSource(
        name="ECB (European Central Bank)",
        handle="ecaborea",
        url="https://www.ecb.europa.eu/",
        category="Instytucja",
        topics=["ECB", "stopy procentowe", "EUR", "inflacja", "strefa euro"],
        description="Europejski Bank Centralny — decyzje i projekcje",
        group="macro",
    ),
    VerifiedSource(
        name="NBP (Narodowy Bank Polski)",
        handle="nbppl",
        url="https://www.nbp.pl/",
        category="Instytucja",
        topics=["NBP", "stopy procentowe", "PLN", "inflacja", "Polska"],
        description="Narodowy Bank Polski — RPP, kursy, raporty",
        group="macro",
    ),
    VerifiedSource(
        name="IMF",
        handle="IMFNews",
        url="https://x.com/IMFNews",
        category="Instytucja",
        topics=["makro", "PKB", "prognozy", "gospodarki światowe"],
        description="Międzynarodowy Fundusz Walutowy — prognozy i raporty",
        group="macro",
    ),
    VerifiedSource(
        name="World Bank",
        handle="WorldBank",
        url="https://x.com/WorldBank",
        category="Instytucja",
        topics=["makro", "rozwój", "PKB", "ubóstwo", "handel"],
        description="Bank Światowy — dane i raporty globalne",
        group="macro",
    ),
    VerifiedSource(
        name="Mohamed El-Erian",
        handle="elerianm",
        url="https://x.com/elerianm",
        category="X",
        topics=["makro", "obligacje", "Fed", "rynki", "inflacja"],
        description="Chief Economic Advisor @ Allianz, komentator makro",
        group="macro",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # GEOPOLITYKA — think tanki, OSINT, analitycy
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="ISW (Institute for the Study of War)",
        handle="TheStudyofWar",
        url="https://x.com/TheStudyofWar",
        category="X",
        topics=["geopolityka", "Ukraina", "Rosja", "konflikty", "bezpieczeństwo"],
        description="Think tank — codzienne analizy konfliktów zbrojnych",
        group="geo",
    ),
    VerifiedSource(
        name="CSIS",
        handle="CSIS",
        url="https://x.com/CSIS",
        category="X",
        topics=["geopolityka", "bezpieczeństwo", "USA", "Chiny", "NATO"],
        description="Center for Strategic & International Studies",
        group="geo",
    ),
    VerifiedSource(
        name="Ian Bremmer",
        handle="ianbremmer",
        url="https://x.com/ianbremmer",
        category="X",
        topics=["geopolityka", "ryzyko polityczne", "G-Zero"],
        description="Założyciel Eurasia Group, analityk ryzyka geopolitycznego",
        group="geo",
    ),
    VerifiedSource(
        name="Walter Isaacson",
        handle="WalterIsaacson",
        url="https://x.com/WalterIsaacson",
        category="X",
        topics=["geopolityka", "historia", "polityka USA", "technologia"],
        description="Biograf, komentator polityczny i technologiczny",
        group="geo",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # GPW / POLSKA
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="Mariusz Hojda",
        handle="k0g00t",
        url="https://x.com/k0g00t",
        category="X",
        topics=["giełda polska", "GPW", "akcje PL"],
        description="Analityk i komentator polskiej giełdy (GPW)",
        group="gpw",
    ),
    VerifiedSource(
        name="Jurek Tomaszewski",
        handle="JJTomaszewski",
        url="https://x.com/JJTomaszewski",
        category="X",
        topics=["giełda polska", "GPW", "giełda US"],
        description="Polska i US giełda — komentarze i analizy",
        group="gpw",
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # YouTube
    # ══════════════════════════════════════════════════════════════════════════
    VerifiedSource(
        name="Good Times Bad Times PL",
        handle="UCTTzMDoVCbaX6K1CwKsRJsQ",
        url="https://www.youtube.com/channel/UCTTzMDoVCbaX6K1CwKsRJsQ",
        category="YT",
        topics=["makro", "gospodarka", "inwestycje", "rynki finansowe"],
        description="Kanał analityczny — makroekonomia i rynki finansowe",
        group="macro",
    ),
]

# Dla kompatybilności wstecznej
VERIFIED_SOURCES = DEFAULT_SOURCES


# ── Helpery ────────────────────────────────────────────────────────────────

def _get_weight(handle: str, source_weights: dict[str, float] | None) -> float:
    """Zwraca wagę źródła. Brak wpisu = 1.0 (domyślnie aktywne)."""
    if source_weights is None:
        return 1.0
    return source_weights.get(handle, 1.0)


def resolve_active_sources(
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict] | None = None,
) -> list[tuple[VerifiedSource, float]]:
    """
    Zwraca listę (source, weight) dla aktywnych źródeł (weight > 0).
    Uwzględnia domyślne i custom X konta.
    """
    result: list[tuple[VerifiedSource, float]] = []

    for src in DEFAULT_SOURCES:
        w = _get_weight(src.handle, source_weights)
        if w > 0.0:
            result.append((src, w))

    for cx in (custom_x_handles or []):
        handle = cx.get("handle", "").strip().lstrip("@")
        if not handle:
            continue
        cx_weight = cx.get("weight")
        if cx_weight is None:
            w = _get_weight(handle, source_weights)
        else:
            w = float(cx_weight)
        if w <= 0.0:
            continue
        if w > 0.0:
            result.append((
                VerifiedSource(
                    name=cx.get("name", f"@{handle}"),
                    handle=handle,
                    url=f"https://x.com/{handle}",
                    category="X",
                    topics=cx.get("topics", []),
                    description=cx.get("description", "Konto dodane przez użytkownika"),
                    is_default=False,
                ),
                w,
            ))

    return result


def _weight_label(w: float) -> str:
    if w >= 0.9:
        return "PRIORYTET"
    if w >= 0.6:
        return "preferowane"
    return "opcjonalne"


def build_x_from_filter(
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict] | None = None,
) -> str:
    """Buduje fragment query Twitter: (from:handle1 OR from:handle2 ...) dla aktywnych źródeł X."""
    active = resolve_active_sources(source_weights, custom_x_handles)
    x_handles = [src.handle for src, _ in active if src.category == "X"]
    if not x_handles:
        return ""
    return "(" + " OR ".join(f"from:{h}" for h in x_handles) + ")"


def apply_trust_to_query(
    base_query: str,
    trust_level: float,
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict] | None = None,
) -> str:
    """Modyfikuje zapytanie Twitter wg trust_level i aktywnych źródeł."""
    if trust_level <= 0.0:
        return base_query

    from_filter = build_x_from_filter(source_weights, custom_x_handles)
    if not from_filter:
        return base_query

    if trust_level >= 1.0:
        return f"({base_query}) {from_filter}"

    return base_query


def get_sources_context_for_prompt(
    trust_level: float,
    source_weights: dict[str, float] | None = None,
    custom_x_handles: list[dict] | None = None,
) -> str:
    """Generuje fragment system prompt z aktywnymi źródłami i ich wagami."""
    if trust_level <= 0.0:
        return ""

    active = resolve_active_sources(source_weights, custom_x_handles)
    x_active = [(src, w) for src, w in active if src.category == "X"]
    yt_active = [(src, w) for src, w in active if src.category == "YT"]
    inst_active = [(src, w) for src, w in active if src.category == "Instytucja"]

    if not x_active and not yt_active and not inst_active:
        return ""

    x_active.sort(key=lambda t: t[1], reverse=True)
    yt_active.sort(key=lambda t: t[1], reverse=True)
    inst_active.sort(key=lambda t: t[1], reverse=True)

    lines = ["## Zweryfikowane źródła — priorytety według wagi"]

    if inst_active:
        lines.append("\n**Instytucje (raporty, dane oficjalne):**")
        for src, w in inst_active:
            lbl = _weight_label(w)
            lines.append(f"- {src.name} [{lbl} {w:.0%}] — {src.description}")

    if x_active:
        lines.append("\n**X (Twitter):**")
        for src, w in x_active:
            tag = "" if src.is_default else " [własne]"
            lbl = _weight_label(w)
            grp = f" [{src.group}]" if src.group else ""
            lines.append(f"- @{src.handle} ({src.name}{tag}){grp} [{lbl} {w:.0%}] — {src.description}")

    if yt_active:
        lines.append("\n**YouTube:**")
        for src, w in yt_active:
            lbl = _weight_label(w)
            lines.append(f"- {src.name} [{lbl} {w:.0%}] — {src.description}")

    if trust_level >= 1.0:
        lines.append(
            "\nPRIORYTET: Korzystaj WYŁĄCZNIE z powyższych zweryfikowanych źródeł. "
            "Im wyższy % przy źródle, tym mocniej go priorytetyzuj."
        )
    elif trust_level >= 0.5:
        lines.append(
            f"\nPREFERENCJE (poziom: {trust_level:.0%}): Mocno preferuj powyższe źródła. "
            "Wyższy % = wyższy priorytet przy wyszukiwaniu."
        )
    else:
        lines.append(
            f"\nWSKAZÓWKA (poziom: {trust_level:.0%}): Preferuj powyższe źródła, możesz korzystać też z innych."
        )

    return "\n".join(lines)
