from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, urlparse

import httpx
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

logger = logging.getLogger(__name__)

_YT_RSS = "https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}"
_YT_HANDLE_URL = "https://www.youtube.com/@{handle}"
_NS = {"atom": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}


def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    url = url.strip()
    # youtu.be/ID
    m = re.match(r"(?:https?://)?youtu\.be/([A-Za-z0-9_-]{11})", url)
    if m:
        return m.group(1)
    # youtube.com/watch?v=ID
    parsed = urlparse(url)
    if "youtube.com" in parsed.netloc:
        qs = parse_qs(parsed.query)
        if "v" in qs:
            return qs["v"][0]
        # shorts/ID
        m2 = re.match(r"/shorts/([A-Za-z0-9_-]{11})", parsed.path)
        if m2:
            return m2.group(1)
        # embed/ID
        m3 = re.match(r"/embed/([A-Za-z0-9_-]{11})", parsed.path)
        if m3:
            return m3.group(1)
    # bare 11-char ID
    if re.match(r"^[A-Za-z0-9_-]{11}$", url):
        return url
    return None


async def resolve_channel_id(url: str) -> tuple[str | None, str | None]:
    """
    Return (channel_id, channel_name) from a channel URL.
    Supports:
      - youtube.com/channel/UCxxxxx
      - youtube.com/@handle
      - youtube.com/c/name
      - youtube.com/user/name
    """
    url = url.strip()
    parsed = urlparse(url)

    # Direct channel ID
    m = re.match(r"/channel/(UC[A-Za-z0-9_-]+)", parsed.path)
    if m:
        channel_id = m.group(1)
        name = await _fetch_channel_name(channel_id)
        return channel_id, name

    # @handle or /c/ or /user/
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True,
                                      headers={"User-Agent": "Mozilla/5.0"}) as client:
            resp = await client.get(url)
            text = resp.text
        # Look for channel ID in page source
        m2 = re.search(r'"channelId":"(UC[A-Za-z0-9_-]+)"', text)
        if m2:
            channel_id = m2.group(1)
            name_m = re.search(r'"channelName":"([^"]+)"', text) or re.search(r'"title":"([^"]+)"', text)
            name = name_m.group(1) if name_m else None
            return channel_id, name
    except Exception as e:
        logger.warning("resolve_channel_id error url=%s err=%s", url, e)

    return None, None


async def _fetch_channel_name(channel_id: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(_YT_RSS.format(channel_id=channel_id))
            root = ET.fromstring(resp.text)
            title_el = root.find("atom:title", _NS)
            return title_el.text if title_el is not None else None
    except Exception:
        return None


async def fetch_channel_videos(channel_id: str, max_results: int = 15) -> list[dict]:
    """Fetch latest videos from a channel via RSS. Returns [{video_id, title, published}]."""
    url = _YT_RSS.format(channel_id=channel_id)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url)
            resp.raise_for_status()
        root = ET.fromstring(resp.text)
        videos = []
        for entry in root.findall("atom:entry", _NS):
            vid_el = entry.find("yt:videoId", _NS)
            title_el = entry.find("atom:title", _NS)
            pub_el = entry.find("atom:published", _NS)
            if vid_el is None:
                continue
            videos.append({
                "video_id": vid_el.text,
                "title": title_el.text if title_el is not None else None,
                "published": pub_el.text if pub_el is not None else None,
            })
            if len(videos) >= max_results:
                break
        return videos
    except Exception as e:
        logger.warning("fetch_channel_videos error channel_id=%s err=%s", channel_id, e)
        return []


def get_transcript(video_id: str, preferred_langs: list[str] | None = None) -> tuple[str, str]:
    """
    Fetch transcript text for a video.
    Returns (transcript_text, language_code).
    Raises ValueError if no transcript available.
    """
    langs = preferred_langs or ["pl", "en", "de", "fr", "es"]
    api = YouTubeTranscriptApi()
    try:
        # Nowe API (>= 0.7): api.fetch(video_id, languages=[...])
        fetched = api.fetch(video_id, languages=langs)
        text = " ".join(
            snippet.text for snippet in fetched
        ).strip()
        lang_code = fetched.video_id if hasattr(fetched, "video_id") else langs[0]
        # Wyciągnij język z obiektu jeśli dostępny
        if hasattr(fetched, "language"):
            lang_code = fetched.language
        elif hasattr(fetched, "language_code"):
            lang_code = fetched.language_code
        return text, lang_code
    except TranscriptsDisabled:
        raise ValueError("Napisy są wyłączone dla tego filmu.")
    except NoTranscriptFound:
        raise ValueError("Brak dostępnych napisów dla tego filmu.")
    except Exception as e:
        raise ValueError(f"Błąd pobierania transkrypcji: {e}")
