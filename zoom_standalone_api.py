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
import os
import sys
from datetime import datetime, timezone

import requests

ZOOM_OAUTH_URL = "https://zoom.us/oauth/token"
ZOOM_API_BASE = "https://api.zoom.us/v2"


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


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

    response = requests.post(ZOOM_OAUTH_URL, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    payload = response.json()
    token = payload.get("access_token")
    if not token:
        raise RuntimeError(f"OAuth response did not include access_token: {payload}")
    return token


def create_meeting(token: str, user_id: str, topic: str, start_time: str, duration: int) -> dict:
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
    response = requests.post(endpoint, headers=headers, json=body, timeout=30)
    response.raise_for_status()
    return response.json()


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
        account_id = require_env("ZOOM_ACCOUNT_ID")
        client_id = require_env("ZOOM_CLIENT_ID")
        client_secret = require_env("ZOOM_CLIENT_SECRET")

        token = fetch_access_token(account_id, client_id, client_secret)
        meeting = create_meeting(token, args.user, args.topic, args.start, args.duration)

        print("Meeting created successfully")
        print(f"ID: {meeting.get('id')}")
        print(f"Join URL: {meeting.get('join_url')}")
        print(f"Start URL: {meeting.get('start_url')}")
        return 0
    except requests.HTTPError as err:
        status = err.response.status_code if err.response is not None else "unknown"
        body = err.response.text if err.response is not None else "<no response body>"
        print(f"Zoom API request failed (status={status}): {body}", file=sys.stderr)
        return 1
    except Exception as err:  # noqa: BLE001
        print(str(err), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
