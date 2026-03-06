#!/usr/bin/env node

/**
 * Send a Zoom Phone SMS callback message for Zoom Virtual Agent handoffs.
 *
 * Required env vars:
 *   ZOOM_ACCOUNT_ID
 *   ZOOM_CLIENT_ID
 *   ZOOM_CLIENT_SECRET
 */

const fs = require('node:fs');

const ZOOM_OAUTH_URL = 'https://zoom.us/oauth/token';
const ZOOM_API_BASE = 'https://api.zoom.us/v2';

const CALLER_KEY_CANDIDATES = [
  'caller_number',
  'original_caller_number',
  'caller',
  'from_number',
  'from',
  'ani',
  'phone_number',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseArgs(argv) {
  const args = {
    messageTemplate: 'Please call {caller_number} back.',
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    i += 1;

    switch (key) {
      case 'recipient-number':
        args.recipientNumber = value;
        break;
      case 'from-number':
        args.fromNumber = value;
        break;
      case 'caller-number':
        args.callerNumber = value;
        break;
      case 'va-context-json':
        args.vaContextJson = value;
        break;
      case 'message-template':
        args.messageTemplate = value;
        break;
      default:
        throw new Error(`Unknown argument: --${key}`);
    }
  }

  if (!args.recipientNumber) {
    throw new Error('Missing required argument: --recipient-number');
  }
  if (!args.fromNumber) {
    throw new Error('Missing required argument: --from-number');
  }

  return args;
}

function findCallerNumber(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCallerNumber(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const key of CALLER_KEY_CANDIDATES) {
      const candidate = value[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }

    for (const nested of Object.values(value)) {
      const found = findCallerNumber(nested);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function resolveCallerNumber({ callerNumber, vaContextJson }) {
  if (callerNumber && callerNumber.trim()) {
    return callerNumber.trim();
  }

  if (!vaContextJson) {
    throw new Error('Provide --caller-number or --va-context-json so caller can be identified');
  }

  const raw = fs.readFileSync(vaContextJson, 'utf8');
  const payload = JSON.parse(raw);
  const caller = findCallerNumber(payload);

  if (!caller) {
    throw new Error(
      `Could not find caller number in VA context JSON. Tried keys: ${CALLER_KEY_CANDIDATES.join(', ')}`,
    );
  }

  return caller;
}

async function httpRequestJson({ method, url, headers, params, body }) {
  const requestUrl = new URL(url);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      requestUrl.searchParams.set(k, String(v));
    }
  }

  const response = await fetch(requestUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Zoom API request failed (status=${response.status}): ${text}`);
  }

  if (!text) {
    return {};
  }

  return JSON.parse(text);
}

async function fetchAccessToken(accountId, clientId, clientSecret) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'account_credentials',
    account_id: accountId,
  });

  const response = await fetch(`${ZOOM_OAUTH_URL}?${params.toString()}`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Zoom API request failed (status=${response.status}): ${text}`);
  }

  const payload = text ? JSON.parse(text) : {};
  if (!payload.access_token) {
    throw new Error(`OAuth response did not include access_token: ${JSON.stringify(payload)}`);
  }

  return String(payload.access_token);
}

async function sendSms(token, { fromNumber, toNumber, message }) {
  return httpRequestJson({
    method: 'POST',
    url: `${ZOOM_API_BASE}/phone/sms`,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: {
      from_number: fromNumber,
      to_numbers: [toNumber],
      message,
    },
  });
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));

    if (!args.messageTemplate.includes('{caller_number}')) {
      throw new Error('--message-template must include {caller_number}');
    }

    const callerNumber = resolveCallerNumber({
      callerNumber: args.callerNumber,
      vaContextJson: args.vaContextJson,
    });
    const message = args.messageTemplate.replace('{caller_number}', callerNumber);

    if (args.dryRun) {
      console.log('Dry run only (no SMS sent)');
      console.log(`Recipient: ${args.recipientNumber}`);
      console.log(`From: ${args.fromNumber}`);
      console.log(`Message: ${message}`);
      return;
    }

    const accountId = requireEnv('ZOOM_ACCOUNT_ID');
    const clientId = requireEnv('ZOOM_CLIENT_ID');
    const clientSecret = requireEnv('ZOOM_CLIENT_SECRET');

    const token = await fetchAccessToken(accountId, clientId, clientSecret);
    const response = await sendSms(token, {
      fromNumber: args.fromNumber,
      toNumber: args.recipientNumber,
      message,
    });

    console.log('SMS send request accepted');
    console.log(JSON.stringify(response, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

void main();
