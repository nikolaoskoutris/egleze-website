const {
  buildAnalyticsRow,
  isAutomatedRequest,
  isSameOriginBrowserRequest,
  writeAnalyticsRow,
} = require('../lib/analytics.js');
const crypto = require('crypto');

const WINDOW_MS = 60 * 1000;
const MAX_EVENTS_PER_WINDOW = 90;
const buckets = new Map();
const RATE_SALT = crypto.randomBytes(32);

function header(req, name) {
  const value = req.headers && (req.headers[name] || req.headers[name.toLowerCase()]);
  return Array.isArray(value) ? value[0] || '' : String(value || '');
}

function clientKey(req) {
  const address = (header(req, 'x-forwarded-for').split(',')[0] || header(req, 'x-real-ip') || 'unknown').trim();
  return crypto.createHash('sha256').update(RATE_SALT).update(address).digest('hex');
}

function rateLimited(req, now) {
  if (buckets.size > 512) {
    for (const [key, value] of buckets) {
      if (now - value.startedAt >= WINDOW_MS) buckets.delete(key);
    }
  }
  const key = clientKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_EVENTS_PER_WINDOW;
}

function log(level, msg, fields) {
  const record = Object.assign({ level, msg, route: '/api/pulse' }, fields || {});
  const fn = level === 'error' ? console.error : console.log;
  fn(JSON.stringify(record));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = header(req, 'x-vercel-id') || undefined;

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'method_not_allowed' });
    return;
  }

  const length = Number(header(req, 'content-length') || 0);
  if (length > 8192) {
    res.status(413).json({ ok: false, error: 'payload_too_large' });
    return;
  }

  if (!isSameOriginBrowserRequest(req)) {
    res.status(403).json({ ok: false, error: 'same_origin_required' });
    return;
  }

  if (isAutomatedRequest(req)) {
    res.status(204).end();
    return;
  }

  if (rateLimited(req, startedAt)) {
    res.status(429).json({ ok: false, error: 'rate_limited' });
    return;
  }

  let payload = req.body;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) { payload = null; }
  }

  const row = buildAnalyticsRow(req, payload);
  if (!row) {
    res.status(400).json({ ok: false, error: 'invalid_event' });
    return;
  }

  try {
    const result = await writeAnalyticsRow(row);
    log('info', 'analytics_stored', {
      requestId,
      event: row.event_name,
      path: row.path,
      duplicate: Boolean(result.duplicate),
      ms: Date.now() - startedAt,
    });
    res.status(202).json({ ok: true });
  } catch (error) {
    log('error', 'analytics_failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - startedAt,
    });
    res.status(500).json({ ok: false, error: 'analytics_write_failed' });
  }
};
