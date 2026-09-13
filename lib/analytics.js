const crypto = require('crypto');

const ANALYTICS_INGEST_URL = process.env.ANALYTICS_INGEST_URL ||
  'https://kerijdhiasrvaxssjqqg.supabase.co/functions/v1/egleze-pulse';

const EVENT_NAMES = new Set([
  'page_view',
  'source_open',
  'video_started',
  'engaged_30s',
  'scroll_depth',
  'share_completed',
  'signup_completed',
  'search_submitted',
  'save_completed',
  'unsave_completed',
  'follow_completed',
  'unfollow_completed',
  'reaction_completed',
]);
const CONTENT_KINDS = new Set(['story', 'episode', 'show', 'topic', 'page']);
const CONSENT_STATES = new Set(['accepted', 'rejected', 'unknown']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function header(req, name) {
  if (!req || !req.headers) return '';
  const value = req.headers[name] || req.headers[name.toLowerCase()] || '';
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return cleaned || null;
}

function cleanPath(value) {
  const raw = cleanText(value, 500) || '/';
  try {
    const parsed = new URL(raw, 'https://egleze.com');
    return parsed.pathname.startsWith('/') ? parsed.pathname.slice(0, 500) : '/';
  } catch (_) {
    return raw.startsWith('/') ? raw.split(/[?#]/)[0].slice(0, 500) : '/';
  }
}

function cleanHostname(value) {
  const raw = cleanText(value, 255);
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : 'https://' + raw).hostname.toLowerCase().slice(0, 255) || null;
  } catch (_) {
    return null;
  }
}

function cleanCountry(value) {
  return /^[A-Z]{2}$/i.test(String(value || '')) ? String(value).toUpperCase() : null;
}

function classifyDevice(userAgent) {
  const ua = String(userAgent || '').toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android/.test(ua)) return 'mobile';
  return 'desktop';
}

function isAutomatedRequest(req) {
  const ua = header(req, 'user-agent');
  const purpose = (header(req, 'purpose') + ' ' + header(req, 'sec-purpose')).toLowerCase();
  return /prefetch|prerender/.test(purpose) ||
    /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram/i.test(ua);
}

function isSameOriginBrowserRequest(req) {
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const origin = header(req, 'origin');
  const referer = header(req, 'referer');
  const fetchSite = header(req, 'sec-fetch-site').toLowerCase();
  if (fetchSite && fetchSite !== 'same-origin') return false;
  if (!host) return false;
  for (const candidate of [origin, referer]) {
    if (!candidate) continue;
    try {
      if (new URL(candidate).host === host) return true;
    } catch (_) {}
  }
  return false;
}

function cleanProperties(eventName, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = {
    source_open: ['provider'],
    share_completed: ['method'],
    signup_completed: ['source'],
    search_submitted: ['result_bucket'],
    scroll_depth: ['percent'],
    reaction_completed: ['reaction'],
    follow_completed: ['follow_type'],
    unfollow_completed: ['follow_type'],
  }[eventName] || [];
  const result = {};
  for (const key of allowed) {
    const cleaned = cleanText(value[key], 48);
    if (cleaned) result[key] = cleaned;
  }
  return result;
}

function buildAnalyticsRow(req, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const eventName = cleanText(payload.event_name, 48);
  if (!EVENT_NAMES.has(eventName)) return null;
  const consentState = CONSENT_STATES.has(payload.consent_state) ? payload.consent_state : 'unknown';
  const sessionId = consentState === 'accepted' && UUID_RE.test(String(payload.session_id || ''))
    ? String(payload.session_id)
    : null;
  const contentKind = CONTENT_KINDS.has(payload.content_kind) ? payload.content_kind : 'page';
  const contentId = Number.isSafeInteger(Number(payload.content_id)) && Number(payload.content_id) > 0
    ? Number(payload.content_id)
    : null;
  const suppliedEventId = String(payload.event_id || '');

  return {
    event_id: UUID_RE.test(suppliedEventId) ? suppliedEventId : crypto.randomUUID(),
    event_name: eventName,
    occurred_at: new Date().toISOString(),
    path: cleanPath(payload.path),
    content_kind: contentKind,
    content_id: contentId,
    referrer_host: cleanHostname(payload.referrer_host || header(req, 'referer')),
    utm_source: cleanText(payload.utm_source, 120),
    utm_medium: cleanText(payload.utm_medium, 120),
    utm_campaign: cleanText(payload.utm_campaign, 160),
    utm_content: cleanText(payload.utm_content, 160),
    utm_term: cleanText(payload.utm_term, 160),
    country_code: cleanCountry(header(req, 'x-vercel-ip-country')),
    device_type: classifyDevice(header(req, 'user-agent')),
    consent_state: consentState,
    session_id: sessionId,
    properties: cleanProperties(eventName, payload.properties),
  };
}

async function writeAnalyticsRow(row, options) {
  const rateKey = options && /^[a-f0-9]{64}$/i.test(String(options.rateKey || ''))
    ? String(options.rateKey)
    : '';
  const response = await fetch(ANALYTICS_INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://egleze.com',
      'X-Egleze-Ingest': 'vercel-pulse-v1',
      ...(rateKey ? { 'X-Egleze-Rate-Key': rateKey } : {}),
    },
    body: JSON.stringify({ row }),
  });
  if (!response.ok && response.status !== 409) {
    const detail = await response.text().catch(() => '');
    throw new Error('analytics insert failed: ' + response.status + ' ' + detail.slice(0, 180));
  }
  return { stored: response.ok, duplicate: response.status === 409 };
}

async function recordAnalyticsEvent(req, payload) {
  const row = buildAnalyticsRow(req, payload);
  if (!row) return { stored: false, reason: 'invalid_event' };
  return writeAnalyticsRow(row);
}

module.exports = {
  EVENT_NAMES,
  buildAnalyticsRow,
  classifyDevice,
  cleanHostname,
  cleanPath,
  isAutomatedRequest,
  isSameOriginBrowserRequest,
  recordAnalyticsEvent,
  writeAnalyticsRow,
};
