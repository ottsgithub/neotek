require('dotenv').config();

const express = require('express');

const app = express();
const port = Number(process.env.PORT || 3000);

const MEETING_STATES = new Set(['in_meeting', 'in meeting', 'meeting', 'inmeeting']);
const BUSY_STATES = new Set([
  'do_not_disturb',
  'dnd',
  'busy',
  'on_a_call',
  'on call',
  'presenting'
]);
const ON_CALL_STATES = new Set([
  'on_call',
  'on call',
  'in_call',
  'in call',
  'ringing',
  'connected',
  'busy'
]);

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function parseBusyFromPresence(presencePayload) {
  const payload = presencePayload || {};
  const presenceValue = normalize(
    payload.presence_status || payload.status || payload.presence || ''
  );

  const isInMeeting = MEETING_STATES.has(presenceValue);
  const isBusy = isInMeeting || BUSY_STATES.has(presenceValue);

  return { isBusy, isInMeeting, normalizedPresence: presenceValue };
}

function parseOnCallFromPhoneStatus(phonePayload) {
  const payload = phonePayload || {};

  const candidates = [
    payload.status,
    payload.call_status,
    payload.callState,
    payload.state,
    payload.presence_status
  ]
    .map(normalize)
    .filter(Boolean);

  const isOnPhoneCall = candidates.some((value) => ON_CALL_STATES.has(value));

  return { isOnPhoneCall, normalizedPhoneStates: candidates };
}

async function zoomGet(path, token) {
  const response = await fetch(`https://api.zoom.us/v2${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`Zoom API ${path} failed: ${response.status} ${text}`);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

app.get('/health', function healthHandler(req, res) {
  return res.json({ ok: true });
});

app.get('/tool/zoom-user-availability', async function zoomAvailabilityHandler(req, res) {
  const userId = normalize(req.query.userId);
  const token = process.env.ZOOM_ACCESS_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: 'Missing ZOOM_ACCESS_TOKEN environment variable.'
    });
  }

  if (!userId) {
    return res.status(400).json({
      error: 'Missing required query parameter: userId'
    });
  }

  try {
    const encodedUserId = encodeURIComponent(userId);

    const presence = await zoomGet(`/users/${encodedUserId}/presence_status`, token);

    let phoneStatus = {};
    try {
      phoneStatus = await zoomGet(`/phone/users/${encodedUserId}/status`, token);
    } catch (error) {
      if (![403, 404].includes(error.status)) {
        throw error;
      }
    }

    const presenceState = parseBusyFromPresence(presence);
    const phoneState = parseOnCallFromPhoneStatus(phoneStatus);

    const isBusy = presenceState.isBusy || phoneState.isOnPhoneCall;
    const isInMeeting = presenceState.isInMeeting;
    const isOnPhoneCall = phoneState.isOnPhoneCall;
    const isAvailable = !isBusy && !isInMeeting && !isOnPhoneCall;

    return res.json({
      userId,
      isBusy,
      isInMeeting,
      isOnPhoneCall,
      isAvailable,
      raw: {
        presence,
        phoneStatus
      }
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Failed to fetch status from Zoom.',
      details: error.message
    });
  }
});

app.listen(port, function onListen() {
  // eslint-disable-next-line no-console
  console.log(`Zoom availability tool listening on http://localhost:${port}`);
});
