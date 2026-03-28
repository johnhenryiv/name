"""Google Maps Timeline data source.

Reads from Google Takeout's Semantic Location History JSON files.
Export instructions: takeout.google.com → select "Location History (Timeline)"

The exported folder structure is:
  Semantic Location History/
    2024/
      2024_JANUARY.json
      2024_FEBRUARY.json
      ...
    2025/
      ...

Each monthly file contains a list of `timelineObjects`, each of which is either:
  - placeVisit  — visited a named location
  - activitySegment — travel between two points
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_MONTH_NAMES = [
    "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
    "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
]


class GoogleMapsSource:
    def __init__(self, takeout_path: str):
        self.takeout_path = Path(os.path.expanduser(takeout_path))

    def fetch(self, date: datetime) -> dict[str, Any]:
        """Return places visited and activities for *date*."""
        logger.info("Google Maps: reading takeout for %s", date.strftime("%Y-%m-%d"))

        monthly_file = self._monthly_file(date)
        if not monthly_file or not monthly_file.exists():
            logger.warning(
                "Google Maps: no takeout file found at %s. "
                "Export your timeline from takeout.google.com.",
                monthly_file or self.takeout_path,
            )
            return {"available": False, "reason": "Takeout file not found"}

        try:
            data = json.loads(monthly_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Google Maps: failed to read %s: %s", monthly_file, exc)
            return {"available": False, "reason": str(exc)}

        target_date = date.strftime("%Y-%m-%d")
        places: list[dict] = []
        activities: list[dict] = []

        for obj in data.get("timelineObjects", []):
            if "placeVisit" in obj:
                visit = obj["placeVisit"]
                start = _parse_timestamp(
                    visit.get("duration", {}).get("startTimestamp", "")
                )
                if start and start.strftime("%Y-%m-%d") == target_date:
                    end = _parse_timestamp(
                        visit.get("duration", {}).get("endTimestamp", "")
                    )
                    duration_min = (
                        round((end - start).total_seconds() / 60)
                        if end and start
                        else None
                    )
                    location = visit.get("location", {})
                    places.append(
                        {
                            "name": location.get("name", "Unknown place"),
                            "address": location.get("address", ""),
                            "lat": location.get("latitudeE7", 0) / 1e7,
                            "lng": location.get("longitudeE7", 0) / 1e7,
                            "arrival": start.strftime("%H:%M"),
                            "departure": end.strftime("%H:%M") if end else None,
                            "duration_minutes": duration_min,
                        }
                    )

            elif "activitySegment" in obj:
                seg = obj["activitySegment"]
                start = _parse_timestamp(
                    seg.get("duration", {}).get("startTimestamp", "")
                )
                if start and start.strftime("%Y-%m-%d") == target_date:
                    end = _parse_timestamp(
                        seg.get("duration", {}).get("endTimestamp", "")
                    )
                    distance_m = seg.get("distance", 0)
                    activities.append(
                        {
                            "type": seg.get("activityType", "UNKNOWN"),
                            "start": start.strftime("%H:%M"),
                            "end": end.strftime("%H:%M") if end else None,
                            "distance_km": round(distance_m / 1000, 2),
                        }
                    )

        return {
            "available": True,
            "date": target_date,
            "places_visited": places,
            "activities": activities,
            "unique_places": len(set(p["name"] for p in places)),
        }

    # ------------------------------------------------------------------

    def _monthly_file(self, date: datetime) -> Path | None:
        month_name = _MONTH_NAMES[date.month - 1]
        year = date.year
        filename = f"{year}_{month_name}.json"
        candidate = self.takeout_path / str(year) / filename
        return candidate


# ------------------------------------------------------------------


def _parse_timestamp(ts: str) -> datetime | None:
    if not ts:
        return None
    # Takeout uses RFC 3339: "2024-03-15T14:32:00Z" or with offset
    for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            return datetime.strptime(ts, fmt)
        except ValueError:
            continue
    # Fallback: strip fractional seconds
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None
