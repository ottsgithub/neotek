/**
 * Standalone Zoom user status checker.
 *
 * This script is intentionally framework-free and server-free:
 * - No Express
 * - No dotenv
 * - No local HTTP server
 *
 * You can run this in any JavaScript environment that provides `fetch`
 * (modern browsers, serverless runtimes, many automation platforms).
 */

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

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

async function zoomGet(path, accessToken, fetchImpl) {
  const response = await fetchImpl(`https://api.zoom.us/v2${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

/**
 * Check whether a Zoom user is busy, in meeting, on a phone call, or available.
 *
 * @param {Object} options
 * @param {string} options.userId - Zoom user id or email.
 * @param {string} options.accessToken - OAuth access token for Zoom API.
 * @param {Function} [options.fetchImpl=fetch] - Optional fetch implementation injection.
 * @returns {Promise<Object>} normalized status payload with `status` set to `Busy` or `Available`.
 */
async function checkZoomUserStatus(options) {
  const userId = normalize(options && options.userId);
  const accessToken = normalize(options && options.accessToken);
  const fetchImpl = (options && options.fetchImpl) || fetch;

  if (!userId) {
    throw new Error('Missing required option: userId');
  }

  if (!accessToken) {
    throw new Error('Missing required option: accessToken');
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('Missing fetch implementation.');
  }

  const encodedUserId = encodeURIComponent(userId);

  const presence = await zoomGet(`/users/${encodedUserId}/presence_status`, accessToken, fetchImpl);

  let phoneStatus = {};
  try {
    phoneStatus = await zoomGet(`/phone/users/${encodedUserId}/status`, accessToken, fetchImpl);
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

  const status = isBusy ? 'Busy' : 'Available';

  return {
    userId,
    status,
    isBusy,
    isInMeeting,
    isOnPhoneCall,
    isAvailable,
    raw: {
      presence,
      phoneStatus
    }
  };
}

// Optional exports for environments that support modules.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkZoomUserStatus };
}
