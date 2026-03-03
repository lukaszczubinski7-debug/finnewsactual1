import re
from html import unescape


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def html_to_text(html: str, max_chars: int = 8000) -> str:
    if not html:
        return ""

    # Strip tags and normalize whitespace before truncation.
    txt = _TAG_RE.sub(" ", html)
    txt = unescape(txt)
    txt = _WS_RE.sub(" ", txt).strip()
    if max_chars and len(txt) > max_chars:
        txt = txt[:max_chars].rstrip() + "..."
    return txt
