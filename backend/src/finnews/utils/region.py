from __future__ import annotations


_REGION_MAP = {
    "polska": "PL",
    "pl": "PL",
    "usa": "US",
    "us": "US",
    "stany zjednoczone": "US",
    "wielka brytania": "GB",
    "uk": "GB",
    "gb": "GB",
    "niemcy": "DE",
    "de": "DE",
    "francja": "FR",
    "fr": "FR",
}


def normalize_region(value: str | None) -> str:
    if value is None:
        return "US"

    cleaned = value.strip()
    if not cleaned:
        return "US"

    normalized = cleaned.casefold()
    if normalized in _REGION_MAP:
        return _REGION_MAP[normalized]

    return cleaned.upper()
