"""Summarizer — sends aggregated day data to Claude and returns a Markdown report."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

_DEFAULT_MODEL = "claude-opus-4-6"

_SYSTEM_PROMPT = """\
You are a thoughtful personal assistant generating a daily retrospective report. \
Your goal is to produce an honest, insightful, and motivating summary of the user's day. \
Be specific about numbers when available, highlight patterns, and end with 1-3 actionable \
reflections or suggestions for tomorrow. Write in a warm, direct second-person voice ("You …"). \
Format the output as clean Markdown with clear section headings.
"""

_USER_PROMPT_TEMPLATE = """\
Here is the raw data collected for {date}. Please generate a daily retrospective report.

---
{data_json}
---

Structure the report with these sections (skip any section if its data is unavailable):

## Daily Retrospective — {date}

### At a Glance
(Key numbers: active time, emails, places visited, screen-on time)

### Where You Spent Your Time
(Top apps and categories from ActivityWatch and Screen Time — note overlaps or discrepancies)

### Where You Went
(Places visited and travel from Google Maps)

### Inbox & Communication
(Email volume, busiest senders, response patterns)

### Screen Health
(Screen-on time vs active work time; longest uninterrupted sessions if inferrable)

### Reflections & Tomorrow
(1-3 concrete, specific suggestions based on today's patterns)
"""


class DaySummarizer:
    def __init__(self, model: str = _DEFAULT_MODEL):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY environment variable not set. "
                "Add it to your .env file."
            )
        self.client = anthropic.Anthropic(api_key=api_key)
        self.model = model

    def summarize(self, day_data: dict[str, Any]) -> str:
        """Call Claude with the day's data and return the Markdown report."""
        date_str = day_data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))

        # Redact heavy arrays to keep the prompt concise
        compact = _compact_data(day_data)
        data_json = json.dumps(compact, indent=2, default=str)

        prompt = _USER_PROMPT_TEMPLATE.format(date=date_str, data_json=data_json)

        logger.info("Summarizing day %s with %s …", date_str, self.model)
        message = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        return message.content[0].text

    def summarize_to_file(self, day_data: dict[str, Any], output_path: str) -> str:
        """Summarize and write to a Markdown file; return the path."""
        report = self.summarize(day_data)
        import pathlib
        path = pathlib.Path(os.path.expanduser(output_path))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(report, encoding="utf-8")
        logger.info("Report written to %s", path)
        return str(path)


# ------------------------------------------------------------------


def _compact_data(data: dict) -> dict:
    """Return a copy with large lists trimmed and unavailable sources removed."""
    out = {}
    for key, value in data.items():
        if not isinstance(value, dict):
            out[key] = value
            continue
        if not value.get("available", True):
            out[key] = {"available": False, "reason": value.get("reason", "")}
            continue
        # Deep-copy and trim any list longer than 20 items
        trimmed = {}
        for k, v in value.items():
            if isinstance(v, list) and len(v) > 20:
                trimmed[k] = v[:20]
                trimmed[f"{k}_truncated"] = True
            else:
                trimmed[k] = v
        out[key] = trimmed
    return out
