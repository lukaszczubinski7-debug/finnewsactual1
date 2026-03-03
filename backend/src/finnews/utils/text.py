from __future__ import annotations


DETECT_MOJIBAKE_MARKERS = ("\u00c3", "\u00c5", "\u00c4", "\u00c2")
REPAIR_SCORE_MARKERS = ("\u00c3", "\u00c4", "\u00c5", "\u00c2", "\u00e2", "\ufffd")


def _score_mojibake(text: str) -> int:
    return sum(text.count(marker) for marker in REPAIR_SCORE_MARKERS)


def _try_repair(text: str, encoding: str) -> str | None:
    try:
        return text.encode(encoding, errors="strict").decode("utf-8", errors="strict")
    except (UnicodeDecodeError, UnicodeEncodeError):
        return None


def detect_mojibake(text: str) -> bool:
    if not isinstance(text, str):
        return False
    if not text:
        return False

    marker_count = sum(text.count(marker) for marker in DETECT_MOJIBAKE_MARKERS)
    return (marker_count / len(text)) > 0.005


def fix_mojibake(text: str) -> str:
    if not isinstance(text, str):
        return text
    if not text:
        return text

    original_score = _score_mojibake(text)
    candidates = [
        repaired
        for encoding in ("cp1252", "latin-1")
        if (repaired := _try_repair(text, encoding))
    ]
    if not candidates:
        return text

    best = min(candidates, key=_score_mojibake)
    if not best.strip():
        return text
    if len(best) < max(1, int(0.7 * len(text))):
        return text
    if _score_mojibake(best) >= original_score:
        return text

    return best


def normalize_text(text: str) -> str:
    if not isinstance(text, str):
        return text
    if detect_mojibake(text):
        return fix_mojibake(text)
    return text
