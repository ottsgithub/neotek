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
