"""macOS Screen Time data source.

Reads from the Knowledge store SQLite database used by macOS Screen Time.
Database path: ~/Library/Application Support/Knowledge/knowledgeC.db

IMPORTANT: The terminal (or Python process) needs Full Disk Access permission
in System Settings → Privacy & Security → Full Disk Access.

The relevant table is ZOBJECT with stream names:
  /app/inFocus          — foreground app usage (device event)
  /app/webUsage         — Safari domain usage
  /display/isScreenLit  — screen on/off events
"""

from __future__ import annotations

import logging
import os
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_DB_PATH = "~/Library/Application Support/Knowledge/knowledgeC.db"
_MAC_EPOCH = datetime(2001, 1, 1, tzinfo=timezone.utc)  # CoreData epoch


class ScreenTimeSource:
    def __init__(
        self,
        db_path: str = _DB_PATH,
        min_minutes: float = 1.0,
    ):
        self.db_path = Path(os.path.expanduser(db_path))
        self.min_seconds = min_minutes * 60

    def fetch(self, date: datetime) -> dict[str, Any]:
        if not self.db_path.exists():
            return {
                "available": False,
                "reason": (
                    f"Screen Time database not found at {self.db_path}. "
                    "Grant Full Disk Access to Terminal in System Settings → "
                    "Privacy & Security → Full Disk Access."
                ),
            }

        start, end = _day_bounds_utc(date)

        try:
            con = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
            con.row_factory = sqlite3.Row
            app_durations = self._query_app_usage(con, start, end)
            web_domains = self._query_web_usage(con, start, end)
            screen_on_seconds = self._query_screen_on(con, start, end)
            con.close()
        except sqlite3.OperationalError as exc:
            logger.warning("Screen Time: DB error: %s", exc)
            return {"available": False, "reason": str(exc)}

        filtered = {
            app: secs
            for app, secs in app_durations.items()
            if secs >= self.min_seconds
        }

        return {
            "available": True,
            "date": date.strftime("%Y-%m-%d"),
            "screen_on_minutes": round(screen_on_seconds / 60),
            "top_apps": _top_n(filtered, 15),
            "top_web_domains": _top_n(web_domains, 10),
            "total_app_minutes": round(sum(filtered.values()) / 60),
        }

    # ------------------------------------------------------------------

    def _query_app_usage(
        self, con: sqlite3.Connection, start: datetime, end: datetime
    ) -> dict[str, float]:
        """Sum foreground app usage from ZOBJECT /app/inFocus."""
        start_cf = _to_cf_time(start)
        end_cf = _to_cf_time(end)

        rows = con.execute(
            """
            SELECT
                ZOBJECT.ZVALUESTRING   AS bundle_id,
                SUM(ZOBJECT.ZENDDATE - ZOBJECT.ZSTARTDATE) AS total_seconds
            FROM ZOBJECT
            WHERE ZOBJECT.ZSTREAMNAME = '/app/inFocus'
              AND ZOBJECT.ZSTARTDATE >= ?
              AND ZOBJECT.ZENDDATE   <= ?
              AND ZOBJECT.ZVALUESTRING IS NOT NULL
            GROUP BY bundle_id
            ORDER BY total_seconds DESC
            """,
            (start_cf, end_cf),
        ).fetchall()

        return {_bundle_to_name(row["bundle_id"]): row["total_seconds"] for row in rows}

    def _query_web_usage(
        self, con: sqlite3.Connection, start: datetime, end: datetime
    ) -> dict[str, float]:
        """Sum web domain usage from ZOBJECT /app/webUsage."""
        start_cf = _to_cf_time(start)
        end_cf = _to_cf_time(end)

        try:
            rows = con.execute(
                """
                SELECT
                    ZOBJECT.ZVALUESTRING   AS domain,
                    SUM(ZOBJECT.ZENDDATE - ZOBJECT.ZSTARTDATE) AS total_seconds
                FROM ZOBJECT
                WHERE ZOBJECT.ZSTREAMNAME = '/app/webUsage'
                  AND ZOBJECT.ZSTARTDATE >= ?
                  AND ZOBJECT.ZENDDATE   <= ?
                  AND ZOBJECT.ZVALUESTRING IS NOT NULL
                GROUP BY domain
                ORDER BY total_seconds DESC
                """,
                (start_cf, end_cf),
            ).fetchall()
        except sqlite3.OperationalError:
            return {}

        return {row["domain"]: row["total_seconds"] for row in rows}

    def _query_screen_on(
        self, con: sqlite3.Connection, start: datetime, end: datetime
    ) -> float:
        """Sum time the screen was lit from /display/isScreenLit."""
        start_cf = _to_cf_time(start)
        end_cf = _to_cf_time(end)

        try:
            rows = con.execute(
                """
                SELECT
                    SUM(ZOBJECT.ZENDDATE - ZOBJECT.ZSTARTDATE) AS total_seconds
                FROM ZOBJECT
                WHERE ZOBJECT.ZSTREAMNAME = '/display/isScreenLit'
                  AND ZOBJECT.ZVALUEINTEGER = 1
                  AND ZOBJECT.ZSTARTDATE >= ?
                  AND ZOBJECT.ZENDDATE   <= ?
                """,
                (start_cf, end_cf),
            ).fetchone()
        except sqlite3.OperationalError:
            return 0.0

        return rows["total_seconds"] if rows and rows["total_seconds"] else 0.0


# ------------------------------------------------------------------


def _day_bounds_utc(date: datetime) -> tuple[datetime, datetime]:
    """Return start/end of day as UTC datetimes, handling both naive and aware input."""
    naive = date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    # Treat naive as local; attach UTC for arithmetic (rough but consistent)
    start = naive.replace(tzinfo=timezone.utc)
    end = start + timedelta(days=1)
    return start, end


def _to_cf_time(dt: datetime) -> float:
    """Convert a UTC datetime to Core Data / CFAbsoluteTime (seconds since 2001-01-01)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - _MAC_EPOCH).total_seconds()


def _bundle_to_name(bundle_id: str) -> str:
    """Best-effort conversion of bundle ID to human-readable app name."""
    _KNOWN: dict[str, str] = {
        "com.apple.Safari": "Safari",
        "com.google.Chrome": "Chrome",
        "com.microsoft.VSCode": "VS Code",
        "com.tinyspeck.slackmacgap": "Slack",
        "us.zoom.xos": "Zoom",
        "com.apple.Terminal": "Terminal",
        "com.googlecode.iterm2": "iTerm2",
        "com.apple.mail": "Mail",
        "com.apple.Notes": "Notes",
        "com.spotify.client": "Spotify",
        "com.apple.Music": "Music",
        "com.apple.dt.Xcode": "Xcode",
        "com.apple.finder": "Finder",
        "com.notion.id": "Notion",
        "md.obsidian": "Obsidian",
        "com.figma.Desktop": "Figma",
        "com.microsoft.teams2": "Teams",
        "com.hnc.Discord": "Discord",
        "org.mozilla.firefox": "Firefox",
    }
    if bundle_id in _KNOWN:
        return _KNOWN[bundle_id]
    # Strip common prefixes for a cleaner display name
    parts = bundle_id.split(".")
    return parts[-1] if parts else bundle_id


def _top_n(durations: dict[str, float], n: int) -> list[dict]:
    return [
        {"name": name, "minutes": round(secs / 60, 1)}
        for name, secs in sorted(durations.items(), key=lambda x: x[1], reverse=True)[:n]
    ]
