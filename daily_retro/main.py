#!/usr/bin/env python3
"""Daily Retrospective Aggregator — CLI entry point.

Usage examples:
  python main.py                   # summarise yesterday (default)
  python main.py --date 2026-03-27 # summarise a specific date
  python main.py --collect-only    # dump raw JSON, skip Claude
  python main.py --no-file         # print to stdout, don't save file
  python main.py --model claude-sonnet-4-6  # override Claude model
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import click
import yaml
from dotenv import load_dotenv
from rich.console import Console
from rich.logging import RichHandler
from rich.markdown import Markdown
from rich.panel import Panel

# ---------------------------------------------------------------------------
# Bootstrap: load .env from the project directory
# ---------------------------------------------------------------------------
_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE / ".env", override=False)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[RichHandler(rich_tracebacks=True, show_path=False)],
)
logger = logging.getLogger("daily_retro")
console = Console()


# ---------------------------------------------------------------------------
# Config loading
# ---------------------------------------------------------------------------

def _load_config() -> dict:
    """Load config.local.yaml if present, falling back to config.yaml."""
    for name in ("config.local.yaml", "config.yaml"):
        path = _HERE / name
        if path.exists():
            with path.open() as f:
                return yaml.safe_load(f) or {}
    return {}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.command()
@click.option(
    "--date", "-d",
    default=None,
    metavar="YYYY-MM-DD",
    help="Date to summarise (default: yesterday).",
)
@click.option(
    "--collect-only", "-c",
    is_flag=True,
    default=False,
    help="Only collect raw data; skip Claude summarisation.",
)
@click.option(
    "--no-file", "-n",
    is_flag=True,
    default=False,
    help="Print report to stdout instead of saving to a file.",
)
@click.option(
    "--model", "-m",
    default=None,
    metavar="MODEL_ID",
    help="Claude model ID to use (overrides config).",
)
@click.option(
    "--output-dir", "-o",
    default=None,
    metavar="DIR",
    help="Directory for output files (overrides config).",
)
@click.option(
    "--verbose", "-v",
    is_flag=True,
    default=False,
    help="Enable debug logging.",
)
def cli(
    date: str | None,
    collect_only: bool,
    no_file: bool,
    model: str | None,
    output_dir: str | None,
    verbose: bool,
) -> None:
    """Generate a daily retrospective from ActivityWatch, Google Maps, Gmail, and Screen Time."""

    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    config = _load_config()

    # Resolve target date
    tz_name = os.environ.get("RETRO_TIMEZONE", config.get("summary", {}).get("timezone", "UTC"))
    target_date = _resolve_date(date, tz_name)
    console.print(
        Panel(
            f"[bold]Daily Retrospective Aggregator[/bold]\n"
            f"Date: [cyan]{target_date.strftime('%A, %B %-d %Y')}[/cyan]",
            expand=False,
        )
    )

    # Collect data
    from aggregator import DayAggregator  # local import after path is set

    aggregator = DayAggregator(config)

    with console.status("[bold green]Collecting data from all sources…"):
        day_data = aggregator.collect(target_date)

    _print_source_status(day_data)

    if collect_only:
        console.print_json(json.dumps(day_data, indent=2, default=str))
        return

    # Summarise
    if not os.environ.get("ANTHROPIC_API_KEY"):
        console.print(
            "[bold red]Error:[/bold red] ANTHROPIC_API_KEY is not set. "
            "Add it to your .env file or export it in your shell."
        )
        sys.exit(1)

    from summarizer import DaySummarizer  # local import

    summary_cfg = config.get("summary", {})
    chosen_model = model or summary_cfg.get("model", "claude-opus-4-6")
    summarizer = DaySummarizer(model=chosen_model)

    with console.status(f"[bold green]Generating summary with {chosen_model}…"):
        report = summarizer.summarize(day_data)

    if no_file:
        console.print(Markdown(report))
        return

    # Write to file
    out_dir = os.environ.get("RETRO_OUTPUT_DIR") or output_dir or summary_cfg.get(
        "output_dir", "~/Documents/Daily Retrospectives"
    )
    filename_tpl = summary_cfg.get("output_filename", "retro_{date}.md")
    filename = filename_tpl.replace("{date}", target_date.strftime("%Y-%m-%d"))
    output_path = str(Path(os.path.expanduser(out_dir)) / filename)

    saved_path = summarizer.summarize_to_file.__func__.__wrapped__ if False else None
    path = Path(os.path.expanduser(output_path))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report, encoding="utf-8")

    console.print(f"\n[bold green]✓[/bold green] Report saved to [cyan]{path}[/cyan]")
    console.print(Markdown(report))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_date(date_str: str | None, tz_name: str) -> datetime:
    """Parse --date or default to yesterday in the configured timezone."""
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            console.print(f"[bold red]Invalid date:[/bold red] {date_str!r}. Use YYYY-MM-DD.")
            sys.exit(1)

    # Default: yesterday in the local/configured timezone
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_name)
        now = datetime.now(tz)
    except Exception:
        now = datetime.now()

    yesterday = now - timedelta(days=1)
    return yesterday.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)


def _print_source_status(day_data: dict) -> None:
    sources = {
        "activitywatch": "ActivityWatch",
        "google_maps": "Google Maps",
        "gmail": "Gmail",
        "screen_time": "Screen Time",
    }
    for key, label in sources.items():
        src = day_data.get(key, {})
        if src.get("available"):
            console.print(f"  [green]✓[/green] {label}")
        else:
            reason = src.get("reason", "unavailable")
            console.print(f"  [yellow]✗[/yellow] {label}: [dim]{reason}[/dim]")


# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # Make sure the daily_retro package is importable regardless of CWD
    sys.path.insert(0, str(_HERE))
    cli()
