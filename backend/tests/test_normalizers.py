from finnews.normalizers.details_normalizer import extract_text_from_markup, normalize_details
from finnews.normalizers.list_normalizer import normalize_list
from finnews.utils.text import detect_mojibake, fix_mojibake


def test_fix_mojibake_repairs_common_utf8_latin1_mixup() -> None:
    assert fix_mojibake("zwi\u00c4\u2122kszy\u00c5\u201ay") == "zwi\u0119kszy\u0142y"


def test_detect_mojibake_returns_false_for_clean_text() -> None:
    assert detect_mojibake("zwi\u0119kszy\u0142y przychody i mar\u017ce.") is False


def test_detect_mojibake_returns_true_for_broken_text() -> None:
    assert detect_mojibake("zwi\u00c4\u2122kszy\u00c5\u201ay przychody i mar\u00c5\u00bce.") is True


def test_extract_text_from_markup_returns_plain_text() -> None:
    assert extract_text_from_markup("<div><p>Akapit 1</p><p>Akapit 2</p></div>") == "Akapit 1\nAkapit 2"


def test_normalize_list_supports_stream_format() -> None:
    raw = {
        "data": {
            "main": {
                "stream": [
                    {
                        "id": "stream-1",
                        "content": {
                            "id": "news-1",
                            "title": "zwi\u00c4\u2122kszy\u00c5\u201ay mar\u00c5\u00bce",
                            "provider": {"displayName": "PAP Biznes \u00c5\u009awiat"},
                            "pubDate": "2026-02-27T10:00:00Z",
                            "clickThroughUrl": {"url": "https://example.com/news-1"},
                            "finance": {"stockTickers": [{"symbol": "ABC"}]},
                            "isHosted": False,
                        },
                    }
                ]
            }
        }
    }

    result = normalize_list(raw)

    assert len(result) > 0
    assert result[0]["id"] == "news-1"
    assert result[0]["title"] == "zwi\u0119kszy\u0142y mar\u017ce"
    assert result[0]["clickUrl"] == "https://example.com/news-1"
    assert result[0]["tickers"] == ["ABC"]
    assert result[0]["provider"] == "PAP Biznes \u015awiat"
    assert result[0]["summary"] == ""


def test_normalize_list_supports_legacy_contents_format() -> None:
    raw = {
        "data": {
            "contents": [
                {
                    "id": "legacy-stream-1",
                    "content": {
                        "id": "legacy-news-1",
                        "title": "NVIDIA zwi\u00c4\u2122ksza inwestycje",
                        "summary": "Nowe moce AI.",
                        "provider": {"displayName": "Reuters"},
                        "pubDate": "2026-02-28T08:30:00Z",
                        "canonicalUrl": {"url": "https://example.com/legacy-news-1"},
                        "finance": {"stockTickers": [{"symbol": "NVDA"}]},
                        "isHosted": True,
                    },
                }
            ]
        }
    }

    result = normalize_list(raw)

    assert result == [
        {
            "id": "legacy-news-1",
            "title": "NVIDIA zwi\u0119ksza inwestycje",
            "summary": "Nowe moce AI.",
            "provider": "Reuters",
            "pubDate": "2026-02-28T08:30:00Z",
            "clickUrl": "https://example.com/legacy-news-1",
            "tickers": ["NVDA"],
            "isHosted": True,
        }
    ]


def test_normalize_details_repairs_text_fields_and_limits_body() -> None:
    raw = {
        "data": {
            "contents": [
                {
                    "content": {
                        "id": "details-1",
                        "title": "Sp\u00c3\u00b3\u00c5\u201aka mo\u00c5\u00bce zwi\u00c4\u2122kszy\u00c4\u2021 EBITDA",
                        "provider": {"displayName": "\u00c5\u00b9r\u00c3\u00b3d\u00c5\u201ao"},
                        "pubDate": "2026-02-27T10:00:00Z",
                        "summary": "Zysk mo\u00c5\u00bce wzrosn\u00c4\u2026\u00c4\u2021.",
                        "canonicalUrl": {"url": "https://example.com/details-1"},
                        "body": {"markup": "<p>Przychody zwi\u00c4\u2122kszy\u00c5\u201ay si\u00c4\u2122 o 12%.</p>"},
                        "finance": {"stockTickers": [{"symbol": "XYZ"}]},
                    }
                }
            ]
        }
    }

    result = normalize_details(raw, max_body_chars=4000)

    assert result == {
        "id": "details-1",
        "title": "Sp\u00f3\u0142ka mo\u017ce zwi\u0119kszy\u0107 EBITDA",
        "provider": "\u0179r\u00f3d\u0142o",
        "pubDate": "2026-02-27T10:00:00Z",
        "summary": "Zysk mo\u017ce wzrosn\u0105\u0107.",
        "tickers": ["XYZ"],
        "url": "https://example.com/details-1",
        "bodyText": "Przychody zwi\u0119kszy\u0142y si\u0119 o 12%.",
    }
