# Standalone Zoom API Script

This repository includes a standalone Python script (`zoom_standalone_api.py`) that creates Zoom meetings using **Server-to-Server OAuth**.

## What changed from the previous version

- Removed third-party dependency on `requests` (now uses Python standard library only).
- Added strict validation for `--start` timestamp and `--duration`.
- Improved API/network error messages.

## 1) Create a Zoom Server-to-Server OAuth app

In Zoom Marketplace:

1. Create **Server-to-Server OAuth** app.
2. Copy:
   - Account ID
   - Client ID
   - Client Secret
3. Add required scopes (minimum):
   - `meeting:write:admin`
   - `user:read:admin`

## 2) Set credentials

```bash
export ZOOM_ACCOUNT_ID="your_account_id"
export ZOOM_CLIENT_ID="your_client_id"
export ZOOM_CLIENT_SECRET="your_client_secret"
```

## 3) Run script

```bash
python zoom_standalone_api.py --topic "API Demo" --start "2026-03-15T17:00:00Z" --duration 30
```

Optional:

- `--user you@company.com` to create the meeting for a specific Zoom user.

## Notes on “run in Zoom”

A standalone script does **not** run inside the Zoom desktop app. It runs on your machine/server and calls Zoom's REST API.
If you need in-client behavior, that is a separate Zoom App or Meeting SDK implementation.

## Publish to GitHub

From this repo:

```bash
git remote add origin <your-github-repo-url>
git push -u origin <your-branch-name>
```
