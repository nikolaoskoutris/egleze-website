const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const EVENTS = new Set([
  'page_view', 'source_open', 'video_started', 'engaged_30s', 'scroll_depth',
  'share_completed', 'signup_completed', 'search_submitted', 'save_completed',
  'unsave_completed', 'follow_completed', 'unfollow_completed', 'reaction_completed',
]);
const KINDS = new Set(['story', 'episode', 'show', 'topic', 'page']);
const CONSENT = new Set(['accepted', 'rejected', 'unknown']);
const DEVICES = new Set(['desktop', 'mobile', 'tablet']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WINDOW_MS = 60_000;
const MAX_EVENTS = 120;
const buckets = new Map<string, { startedAt: number; count: number }>();

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return cleaned || null;
}

function allowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin') || '';
  if (origin === 'https://egleze.com' || origin === 'https://www.egleze.com') return true;
  return /^https:\/\/egleze-website(?:-[a-z0-9-]+)*\.vercel\.app$/i.test(origin);
}

function automated(req: Request): boolean {
  const ua = req.headers.get('user-agent') || '';
  const purpose = ((req.headers.get('purpose') || '') + ' ' + (req.headers.get('sec-purpose') || '')).toLowerCase();
  return /prefetch|prerender/.test(purpose) ||
    /bot|crawler|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram/i.test(ua);
}

async function rateKey(req: Request): Promise<string> {
  const forwarded = req.headers.get('x-egleze-rate-key') || '';
  if (/^[a-f0-9]{64}$/i.test(forwarded)) return forwarded.toLowerCase();
  const address = (req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown').split(',')[0].trim();
  const day = new Date().toISOString().slice(0, 10);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(day + ':' + address));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function rateLimited(req: Request, now: number): Promise<boolean> {
  if (buckets.size > 512) {
    for (const [key, value] of buckets) if (now - value.startedAt >= WINDOW_MS) buckets.delete(key);
  }
  const key = await rateKey(req);
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > MAX_EVENTS;
}

function cleanPath(value: unknown): string {
  const raw = cleanText(value, 500) || '/';
  try { return new URL(raw, 'https://egleze.com').pathname.slice(0, 500) || '/'; }
  catch { return '/'; }
}

function cleanHost(value: unknown): string | null {
  const raw = cleanText(value, 255);
  if (!raw) return null;
  try { return new URL(raw.includes('://') ? raw : 'https://' + raw).hostname.toLowerCase().slice(0, 255) || null; }
  catch { return null; }
}

function cleanProperties(event: string, value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allow: Record<string, string[]> = {
    source_open: ['provider'], share_completed: ['method'], signup_completed: ['source'],
    search_submitted: ['result_bucket'], scroll_depth: ['percent'], reaction_completed: ['reaction'],
    follow_completed: ['follow_type'], unfollow_completed: ['follow_type'],
  };
  const result: Record<string, string> = {};
  for (const key of allow[event] || []) {
    const cleaned = cleanText((value as Record<string, unknown>)[key], 48);
    if (cleaned) result[key] = cleaned;
  }
  return result;
}

function normalize(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const event = cleanText(input.event_name, 48);
  if (!event || !EVENTS.has(event)) return null;
  const consent = CONSENT.has(String(input.consent_state)) ? String(input.consent_state) : 'unknown';
  const suppliedSession = String(input.session_id || '');
  const suppliedEvent = String(input.event_id || '');
  const id = Number(input.content_id);
  const country = String(input.country_code || '').toUpperCase();
  const device = String(input.device_type || 'desktop');
  return {
    event_id: UUID_RE.test(suppliedEvent) ? suppliedEvent : crypto.randomUUID(),
    event_name: event,
    occurred_at: new Date().toISOString(),
    path: cleanPath(input.path),
    content_kind: KINDS.has(String(input.content_kind)) ? String(input.content_kind) : 'page',
    content_id: Number.isSafeInteger(id) && id > 0 ? id : null,
    referrer_host: cleanHost(input.referrer_host),
    utm_source: cleanText(input.utm_source, 120),
    utm_medium: cleanText(input.utm_medium, 120),
    utm_campaign: cleanText(input.utm_campaign, 160),
    utm_content: cleanText(input.utm_content, 160),
    utm_term: cleanText(input.utm_term, 160),
    country_code: /^[A-Z]{2}$/.test(country) ? country : null,
    device_type: DEVICES.has(device) ? device : 'desktop',
    consent_state: consent,
    session_id: consent === 'accepted' && UUID_RE.test(suppliedSession) ? suppliedSession : null,
    properties: cleanProperties(event, input.properties),
  };
}

function json(status: number, body?: Record<string, unknown>): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  if (!allowedOrigin(req)) return json(403, { ok: false, error: 'origin_required' });
  if (automated(req)) return json(204);
  if (Number(req.headers.get('content-length') || 0) > 8192) return json(413, { ok: false, error: 'payload_too_large' });
  if (await rateLimited(req, startedAt)) return json(429, { ok: false, error: 'rate_limited' });

  let body: Record<string, unknown> | null = null;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: 'invalid_json' }); }
  const row = normalize(body && body.row);
  if (!row) return json(400, { ok: false, error: 'invalid_event' });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(503, { ok: false, error: 'storage_not_configured' });

  const stored = await fetch(SUPABASE_URL + '/rest/v1/analytics_events', {
    method: 'POST',
    headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!stored.ok && stored.status !== 409) {
    console.error(JSON.stringify({ level: 'error', msg: 'pulse_insert_failed', status: stored.status, ms: Date.now() - startedAt }));
    return json(500, { ok: false, error: 'storage_failed' });
  }
  console.log(JSON.stringify({ level: 'info', msg: 'pulse_stored', event: row.event_name, duplicate: stored.status === 409, ms: Date.now() - startedAt }));
  return json(202, { ok: true });
});
