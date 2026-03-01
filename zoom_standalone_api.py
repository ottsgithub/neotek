#!/usr/bin/env python3
"""Standalone Zoom API script using Server-to-Server OAuth.

Usage:
  export ZOOM_ACCOUNT_ID=...
  export ZOOM_CLIENT_ID=...
  export ZOOM_CLIENT_SECRET=...
  python zoom_standalone_api.py --topic "Demo" --start "2026-03-15T17:00:00Z" --duration 30
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ZOOM_OAUTH_URL = "https://zoom.us/oauth/token"
ZOOM_API_BASE = "https://api.zoom.us/v2"


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def normalize_utc_iso8601(value: str) -> str:
    """Return an RFC3339 UTC timestamp accepted by Zoom.

    Accepts values like:
    - 2026-03-15T17:00:00Z
    - 2026-03-15T17:00:00+00:00
    """
    candidate = value.strip()
    if candidate.endswith("Z"):
        candidate = candidate[:-1] + "+00:00"

    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise RuntimeError(
            "Invalid --start value. Use UTC ISO format like 2026-03-15T17:00:00Z"
        ) from exc

    if parsed.tzinfo is None:
        raise RuntimeError("--start must include timezone information (use Z for UTC)")

    normalized = parsed.astimezone(timezone.utc).replace(microsecond=0)
    return normalized.isoformat().replace("+00:00", "Z")


def http_post_json(url: str, headers: dict[str, str], params: dict[str, str] | None, body: dict[str, Any] | None) -> dict[str, Any]:
    query = f"?{urlencode(params)}" if params else ""
    payload = json.dumps(body).encode("utf-8") if body is not None else None

    request = Request(
        url=f"{url}{query}",
        data=payload,
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=30) as response:  # noqa: S310 - Zoom API URL is constant
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as err:
        error_body = err.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Zoom API request failed (status={err.code}): {error_body}") from err
    except URLError as err:
        raise RuntimeError(f"Network error while calling Zoom API: {err}") from err


def fetch_access_token(account_id: str, client_id: str, client_secret: str) -> str:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("utf-8")
    headers = {
        "Authorization": f"Basic {basic}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    params = {
        "grant_type": "account_credentials",
        "account_id": account_id,
    }

    payload = http_post_json(ZOOM_OAUTH_URL, headers=headers, params=params, body=None)
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"OAuth response did not include access_token: {payload}")
    return str(token)


def create_meeting(token: str, user_id: str, topic: str, start_time: str, duration: int) -> dict[str, Any]:
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    body = {
        "topic": topic,
        "type": 2,
        "start_time": start_time,
        "duration": duration,
        "timezone": "UTC",
        "settings": {
            "join_before_host": False,
            "waiting_room": True,
        },
    }

    endpoint = f"{ZOOM_API_BASE}/users/{user_id}/meetings"
    payload = http_post_json(endpoint, headers=headers, params=None, body=body)
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create a Zoom meeting via API")
    parser.add_argument("--user", default="me", help="Zoom user ID or email (default: me)")
    parser.add_argument("--topic", required=True, help="Meeting topic")
    parser.add_argument(
        "--start",
        default=datetime.now(tz=timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        help="UTC ISO datetime, e.g. 2026-03-15T17:00:00Z",
    )
    parser.add_argument("--duration", type=int, default=30, help="Duration in minutes")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    try:
        if args.duration <= 0:
            raise RuntimeError("--duration must be a positive integer")

        normalized_start = normalize_utc_iso8601(args.start)

        account_id = require_env("ZOOM_ACCOUNT_ID")
        client_id = require_env("ZOOM_CLIENT_ID")
        client_secret = require_env("ZOOM_CLIENT_SECRET")
        token = fetch_access_token(account_id, client_id, client_secret)
        meeting = create_meeting(token, args.user, args.topic, normalized_start, args.duration)

        print("Meeting created successfully")
        print(f"ID: {meeting.get('id')}")
        print(f"Join URL: {meeting.get('join_url')}")
        print(f"Start URL: {meeting.get('start_url')}")
        return 0
    except RuntimeError as err:
        print(str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
