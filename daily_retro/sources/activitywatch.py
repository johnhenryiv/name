"""ActivityWatch data source — queries the local AW REST API."""

from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import requests

logger = logging.getLogger(__name__)

# ActivityWatch REST API base path
_API = "{base_url}/api/0"


class ActivityWatchSource:
    """Fetch window-focus and AFK events from a running ActivityWatch instance."""

    def __init__(self, base_url: str = "http://localhost:5600"):
        self.base_url = base_url.rstrip("/")
        self._api = f"{self.base_url}/api/0"

    # ------------------------------------------------------------------
    # Public
    # ------------------------------------------------------------------

    def fetch(self, date: datetime) -> dict[str, Any]:
        """Return a structured summary for *date* (midnight-to-midnight local)."""
        start, end = _day_bounds(date)
        logger.info("ActivityWatch: fetching %s → %s", start.isoformat(), end.isoformat())

        try:
            buckets = self._get_buckets()
        except requests.RequestException as exc:
            logger.warning("ActivityWatch unreachable (%s). Skipping.", exc)
            return {"available": False, "reason": str(exc)}

        window_bucket = _pick_bucket(buckets, "aw-watcher-window")
        afk_bucket = _pick_bucket(buckets, "aw-watcher-afk")

        window_events = self._get_events(window_bucket, start, end) if window_bucket else []
        afk_events = self._get_events(afk_bucket, start, end) if afk_bucket else []

        active_seconds = _sum_non_afk_seconds(afk_events)
        app_durations = _aggregate_app_durations(window_events)
        category_durations = _aggregate_categories(window_events)

        return {
            "available": True,
            "date": date.strftime("%Y-%m-%d"),
            "active_time_minutes": round(active_seconds / 60),
            "top_apps": _top_n(app_durations, 10),
            "categories": category_durations,
            "window_event_count": len(window_events),
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_buckets(self) -> dict:
        r = requests.get(f"{self._api}/buckets", timeout=5)
        r.raise_for_status()
        return r.json()

    def _get_events(
        self, bucket_id: str, start: datetime, end: datetime
    ) -> list[dict]:
        params = {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "limit": 100_000,
        }
        r = requests.get(
            f"{self._api}/buckets/{bucket_id}/events",
            params=params,
            timeout=30,
        )
        r.raise_for_status()
        return r.json()


# ------------------------------------------------------------------
# Module-level helpers
# ------------------------------------------------------------------


def _day_bounds(date: datetime) -> tuple[datetime, datetime]:
    """Return (start_of_day, end_of_day) in UTC for the given local date."""
    local_start = date.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    # If the datetime has no tzinfo, assume it is local and attach UTC offset 0
    # (the AW API accepts ISO-8601 with offset).
    if local_start.tzinfo is None:
        local_start = local_start.replace(tzinfo=timezone.utc)
        local_end = local_end.replace(tzinfo=timezone.utc)
    return local_start, local_end


def _pick_bucket(buckets: dict, prefix: str) -> str | None:
    """Return the first bucket ID whose name starts with *prefix*."""
    for bucket_id in buckets:
        if bucket_id.startswith(prefix):
            return bucket_id
    return None


def _sum_non_afk_seconds(afk_events: list[dict]) -> float:
    total = 0.0
    for ev in afk_events:
        if ev.get("data", {}).get("status") == "not-afk":
            total += ev.get("duration", 0)
    return total


def _aggregate_app_durations(window_events: list[dict]) -> dict[str, float]:
    apps: dict[str, float] = {}
    for ev in window_events:
        app = ev.get("data", {}).get("app", "Unknown")
        apps[app] = apps.get(app, 0.0) + ev.get("duration", 0.0)
    return apps


def _aggregate_categories(window_events: list[dict]) -> dict[str, float]:
    """Group apps into broad categories by heuristic matching."""
    _CATEGORY_RULES: list[tuple[str, list[str]]] = [
        ("Communication", ["slack", "zoom", "teams", "mail", "messages", "discord", "telegram", "whatsapp"]),
        ("Development", ["code", "xcode", "terminal", "iterm", "vim", "emacs", "cursor", "intellij", "pycharm"]),
        ("Browser", ["chrome", "safari", "firefox", "arc", "brave", "edge"]),
        ("Productivity", ["notion", "obsidian", "word", "excel", "powerpoint", "pages", "numbers"]),
        ("Entertainment", ["youtube", "netflix", "spotify", "vlc", "plex", "twitch"]),
        ("Design", ["figma", "sketch", "photoshop", "illustrator", "affinity"]),
    ]

    categories: dict[str, float] = {}
    for ev in window_events:
        app = ev.get("data", {}).get("app", "").lower()
        duration = ev.get("duration", 0.0)
        matched = False
        for cat, keywords in _CATEGORY_RULES:
            if any(kw in app for kw in keywords):
                categories[cat] = categories.get(cat, 0.0) + duration
                matched = True
                break
        if not matched:
            categories["Other"] = categories.get("Other", 0.0) + duration
    return {k: round(v / 60, 1) for k, v in categories.items()}


def _top_n(durations: dict[str, float], n: int) -> list[dict]:
    sorted_items = sorted(durations.items(), key=lambda x: x[1], reverse=True)
    return [
        {"app": app, "minutes": round(secs / 60, 1)}
        for app, secs in sorted_items[:n]
        if secs >= 60
    ]
