"""Gmail data source — reads today's email stats via the Gmail API.

Setup (one-time):
  1. Go to console.cloud.google.com → create a project
  2. Enable the Gmail API
  3. Create OAuth 2.0 credentials (Desktop app)
  4. Download credentials JSON → save as ~/.config/daily_retro/gmail_credentials.json
  5. First run will open a browser to authorize; token saved automatically.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError

    _GOOGLE_LIBS = True
except ImportError:
    _GOOGLE_LIBS = False
    logger.warning(
        "Google API libraries not installed. Run: pip install google-api-python-client "
        "google-auth-oauthlib google-auth-httplib2"
    )

_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]


class GmailSource:
    def __init__(
        self,
        credentials_file: str = "~/.config/daily_retro/gmail_credentials.json",
        token_file: str = "~/.config/daily_retro/gmail_token.json",
        max_results: int = 100,
        important_domains: list[str] | None = None,
    ):
        self.credentials_file = Path(os.path.expanduser(credentials_file))
        self.token_file = Path(os.path.expanduser(token_file))
        self.max_results = max_results
        self.important_domains = [d.lower() for d in (important_domains or [])]

    def fetch(self, date: datetime) -> dict[str, Any]:
        if not _GOOGLE_LIBS:
            return {"available": False, "reason": "google-api-python-client not installed"}

        if not self.credentials_file.exists():
            return {
                "available": False,
                "reason": (
                    f"Gmail credentials not found at {self.credentials_file}. "
                    "See setup instructions in sources/gmail.py."
                ),
            }

        try:
            service = self._get_service()
        except Exception as exc:
            logger.warning("Gmail: auth failed: %s", exc)
            return {"available": False, "reason": str(exc)}

        date_str = date.strftime("%Y/%m/%d")
        after = date.replace(hour=0, minute=0, second=0, microsecond=0)
        before = after.replace(hour=23, minute=59, second=59)

        after_epoch = int(after.timestamp())
        before_epoch = int(before.timestamp())
        query = f"after:{after_epoch} before:{before_epoch}"

        try:
            received = self._list_messages(service, f"in:inbox {query}")
            sent = self._list_messages(service, f"in:sent {query}")

            received_details = self._fetch_headers(service, received[: self.max_results])
            sent_details = self._fetch_headers(service, sent[: self.max_results])
        except Exception as exc:
            logger.warning("Gmail: fetch failed: %s", exc)
            return {"available": False, "reason": str(exc)}

        senders = _count_senders(received_details)
        important_count = _count_important(received_details, self.important_domains)

        return {
            "available": True,
            "date": date.strftime("%Y-%m-%d"),
            "received_count": len(received),
            "sent_count": len(sent),
            "important_count": important_count,
            "top_senders": _top_n(senders, 5),
            "unread_count": self._unread_count(service, date),
            "threads_participated": len(set(m.get("threadId") for m in received + sent)),
        }

    # ------------------------------------------------------------------

    def _get_service(self):
        creds = None
        if self.token_file.exists():
            creds = Credentials.from_authorized_user_file(str(self.token_file), _SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    str(self.credentials_file), _SCOPES
                )
                creds = flow.run_local_server(port=0)
            self.token_file.parent.mkdir(parents=True, exist_ok=True)
            self.token_file.write_text(creds.to_json())

        return build("gmail", "v1", credentials=creds)

    def _list_messages(self, service, query: str) -> list[dict]:
        messages = []
        page_token = None
        while True:
            resp = (
                service.users()
                .messages()
                .list(
                    userId="me",
                    q=query,
                    maxResults=min(500, self.max_results),
                    pageToken=page_token,
                )
                .execute()
            )
            messages.extend(resp.get("messages", []))
            page_token = resp.get("nextPageToken")
            if not page_token or len(messages) >= self.max_results:
                break
        return messages

    def _fetch_headers(self, service, messages: list[dict]) -> list[dict]:
        results = []
        for msg in messages:
            try:
                full = (
                    service.users()
                    .messages()
                    .get(userId="me", id=msg["id"], format="metadata",
                         metadataHeaders=["From", "To", "Subject"])
                    .execute()
                )
                headers = {
                    h["name"]: h["value"]
                    for h in full.get("payload", {}).get("headers", [])
                }
                results.append(
                    {
                        "id": msg["id"],
                        "threadId": msg.get("threadId"),
                        "from": headers.get("From", ""),
                        "to": headers.get("To", ""),
                        "subject": headers.get("Subject", "(no subject)"),
                    }
                )
            except Exception:
                pass
        return results

    def _unread_count(self, service, date: datetime) -> int:
        try:
            after_epoch = int(date.replace(hour=0, minute=0, second=0).timestamp())
            before_epoch = int(date.replace(hour=23, minute=59, second=59).timestamp())
            query = f"is:unread in:inbox after:{after_epoch} before:{before_epoch}"
            resp = service.users().messages().list(userId="me", q=query, maxResults=500).execute()
            return resp.get("resultSizeEstimate", 0)
        except Exception:
            return 0


# ------------------------------------------------------------------


def _count_senders(messages: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for m in messages:
        sender = _extract_email(m.get("from", ""))
        if sender:
            counts[sender] = counts.get(sender, 0) + 1
    return counts


def _extract_email(raw: str) -> str:
    """Extract plain email address from 'Name <email@domain>' format."""
    raw = raw.strip()
    if "<" in raw and ">" in raw:
        return raw.split("<")[1].split(">")[0].strip().lower()
    return raw.lower()


def _count_important(messages: list[dict], domains: list[str]) -> int:
    if not domains:
        return 0
    count = 0
    for m in messages:
        email = _extract_email(m.get("from", ""))
        if any(email.endswith(d) for d in domains):
            count += 1
    return count


def _top_n(counts: dict[str, int], n: int) -> list[dict]:
    return [
        {"sender": k, "count": v}
        for k, v in sorted(counts.items(), key=lambda x: x[1], reverse=True)[:n]
    ]
