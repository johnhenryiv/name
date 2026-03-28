"""Aggregator — collects data from all sources for a given date."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any

from sources.activitywatch import ActivityWatchSource
from sources.google_maps import GoogleMapsSource
from sources.gmail import GmailSource
from sources.screen_time import ScreenTimeSource

logger = logging.getLogger(__name__)


class DayAggregator:
    """Orchestrate all data sources and return a unified payload for a single day."""

    def __init__(self, config: dict):
        cfg = config

        self.aw = ActivityWatchSource(
            base_url=os.environ.get(
                "ACTIVITYWATCH_URL",
                cfg.get("activitywatch", {}).get("base_url", "http://localhost:5600"),
            )
        )

        maps_cfg = cfg.get("google_maps", {})
        maps_path = os.environ.get(
            "GOOGLE_MAPS_TAKEOUT_PATH",
            maps_cfg.get("takeout_path", "~/Downloads/Takeout/Location History/Semantic Location History"),
        )
        self.maps = GoogleMapsSource(takeout_path=maps_path)

        gmail_cfg = cfg.get("gmail", {})
        self.gmail = GmailSource(
            credentials_file=os.environ.get(
                "GMAIL_CREDENTIALS_FILE",
                gmail_cfg.get("credentials_file", "~/.config/daily_retro/gmail_credentials.json"),
            ),
            token_file=os.environ.get(
                "GMAIL_TOKEN_FILE",
                gmail_cfg.get("token_file", "~/.config/daily_retro/gmail_token.json"),
            ),
            max_results=gmail_cfg.get("max_results", 100),
            important_domains=gmail_cfg.get("important_domains", []),
        )

        st_cfg = cfg.get("screen_time", {})
        self.screen_time = ScreenTimeSource(
            db_path=st_cfg.get("db_path", "~/Library/Application Support/Knowledge/knowledgeC.db"),
            min_minutes=st_cfg.get("min_minutes", 1),
        )

    def collect(self, date: datetime) -> dict[str, Any]:
        """Fetch all sources and return a combined data dict."""
        logger.info("Collecting data for %s …", date.strftime("%Y-%m-%d"))

        results: dict[str, Any] = {
            "date": date.strftime("%Y-%m-%d"),
            "collected_at": datetime.utcnow().isoformat() + "Z",
        }

        results["activitywatch"] = _safe_fetch(self.aw.fetch, date, "ActivityWatch")
        results["google_maps"] = _safe_fetch(self.maps.fetch, date, "Google Maps")
        results["gmail"] = _safe_fetch(self.gmail.fetch, date, "Gmail")
        results["screen_time"] = _safe_fetch(self.screen_time.fetch, date, "Screen Time")

        results["meta"] = _build_meta(results)
        return results


# ------------------------------------------------------------------


def _safe_fetch(fn, date: datetime, label: str) -> dict:
    try:
        return fn(date)
    except Exception as exc:
        logger.exception("%s: unexpected error", label)
        return {"available": False, "reason": f"Unexpected error: {exc}"}


def _build_meta(results: dict) -> dict:
    sources_available = [
        src
        for src in ("activitywatch", "google_maps", "gmail", "screen_time")
        if results.get(src, {}).get("available", False)
    ]
    sources_unavailable = [
        src
        for src in ("activitywatch", "google_maps", "gmail", "screen_time")
        if not results.get(src, {}).get("available", False)
    ]
    return {
        "sources_available": sources_available,
        "sources_unavailable": sources_unavailable,
        "source_count": len(sources_available),
    }
