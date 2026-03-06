# Zoom User Status Checker (Standalone JavaScript)

This repository contains a **standalone JavaScript** function that calls Zoom APIs directly to determine whether a user is:

- Busy
- In a meeting
- On a phone call
- Available

## Why this version

This is **not** an Express server and **does not require running Node.js as a web service**.
You can use this function directly in any JavaScript runtime that supports `fetch` (for example, serverless functions, automation tools, browser-based workflows, or platforms that execute JavaScript snippets).

## File

- `src/zoom-user-status.js`
  - Main function: `checkZoomUserStatus({ userId, accessToken, fetchImpl? })`

## Zoom endpoints used

1. `GET /v2/users/{userId}/presence_status`
2. `GET /v2/phone/users/{userId}/status`

If phone status returns `403` or `404`, the script falls back to presence-only evaluation.

## Usage

```javascript
// CommonJS environments
const { checkZoomUserStatus } = require('./src/zoom-user-status');

async function run() {
  const result = await checkZoomUserStatus({
    userId: 'user@example.com',
    accessToken: 'ZOOM_OAUTH_ACCESS_TOKEN'
  });

  // Single variable you can reference from other JavaScript
  const userStatus = result.status; // 'Busy' or 'Available'

  console.log(userStatus, result);
}

run();
```

## Returned payload

```json
{
  "userId": "user@example.com",
  "status": "Busy",
  "isBusy": true,
  "isInMeeting": false,
  "isOnPhoneCall": true,
  "isAvailable": false,
  "raw": {
    "presence": {},
    "phoneStatus": {}
  }
}
```

## Notes for Zoom Phone AI Virtual Agent tool logic

- `isOnPhoneCall === true` → user is currently on a phone call.
- `isInMeeting === true` → user is currently in a meeting.
- `isBusy === true` → user should be treated as unavailable.
- `isAvailable === true` → user can be treated as reachable.


## Quick reference variable

After calling `checkZoomUserStatus(...)`, use:

- `result.status` → returns exactly `"Busy"` or `"Available"`.
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

---

## Zoom Virtual Agent callback SMS script

This repo also includes `zoom_va_sms_callback.js` to send a Zoom Phone SMS to a busy person with instructions to call the original caller back.

### Use case

- A caller reaches Zoom Virtual Agent.
- The intended person is busy.
- Send that person an SMS like: `Please call +15559876543 back.`

### Required scopes

For Server-to-Server OAuth, add scopes required for Zoom Phone SMS in your Zoom app (for example, appropriate `phone:sms:*` and related phone scopes for your account configuration).

### Run with Virtual Agent context JSON

```bash
node zoom_va_sms_callback.js \
  --recipient-number +15551234567 \
  --from-number +15557654321 \
  --va-context-json va_context.json
```

### Run with explicit caller number

```bash
node zoom_va_sms_callback.js \
  --recipient-number +15551234567 \
  --from-number +15557654321 \
  --caller-number +15559876543
```

### Dry run (no API call)

```bash
node zoom_va_sms_callback.js \
  --recipient-number +15551234567 \
  --from-number +15557654321 \
  --caller-number +15559876543 \
  --dry-run
```

### Custom message format

```bash
node zoom_va_sms_callback.js \
  --recipient-number +15551234567 \
  --from-number +15557654321 \
  --caller-number +15559876543 \
  --message-template "Callback requested from {caller_number}."
```
