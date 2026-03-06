# Zoom User Availability Tool (Zoom Phone AI Virtual Agent)

This repository provides a starter API implementation you can use as a **Tool** for a Zoom Phone AI Virtual Agent skill.

It checks whether a Zoom user is:
- Busy
- In a meeting
- On a phone call
- Available

## What this does

The API endpoint `GET /tool/zoom-user-availability?userId=<zoom_user_id>` calls Zoom APIs and normalizes the response for the AI skill.

### Zoom endpoints used

1. `GET /v2/users/{userId}/presence_status`
   - Used to determine if the user appears to be in a meeting or marked busy by presence.
2. `GET /v2/phone/users/{userId}/status`
   - Used to determine if the user is on an active Zoom Phone call.

> Note: Depending on your account features/plan and Zoom API behavior, phone status fields can vary. The implementation includes defensive parsing and fallbacks.

## Setup

1. Use Node.js 18+ (plain JavaScript runtime).
2. Create an environment file:

```bash
cp .env.example .env
```

3. Set `ZOOM_ACCESS_TOKEN` to a valid OAuth access token with scopes needed for user presence and phone status.

4. Install dependencies and run:

```bash
npm install
npm start
```

## Example call

```bash
curl "http://localhost:3000/tool/zoom-user-availability?userId=user@example.com"
```

## Example response

```json
{
  "userId": "user@example.com",
  "isBusy": true,
  "isInMeeting": true,
  "isOnPhoneCall": false,
  "isAvailable": false,
  "raw": {
    "presence": {
      "presence_status": "Do_Not_Disturb"
    },
    "phoneStatus": {
      "status": "idle"
    }
  }
}
```

## Notes for Zoom Phone AI Virtual Agent Tool integration

- Configure your Tool to call this endpoint.
- In your skill logic, use:
  - `isOnPhoneCall === true` → user is currently on a phone call.
  - `isInMeeting === true` → user is currently in a meeting.
  - `isBusy === true` → user should be treated as unavailable.
  - `isAvailable === true` → user can be treated as reachable.
