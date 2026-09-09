// ─────────────────────────────────────────────────────────────────
// /api/subscribe.js — Vercel serverless function for email capture.
//
// Dual-write on every signup:
//   1. INSERT into Supabase `subscribers` (our own permanent record)
//   2. POST to Beehiiv subscriptions (instant newsletter delivery)
//
// Order matters: Supabase first. If Beehiiv is down or plan-gated,
// the email is still safely captured and beehiiv-sync.js picks it
// up on the next backfill run. The user always gets a success.
//
// Env vars required in Vercel (Settings → Environment Variables):
//   BEEHIIV_API_KEY, BEEHIIV_PUBLICATION_ID
// Optional OpenAI Ads conversion tracking env var:
//   OPENAI_ADS_CAPI_KEY
//   OPENAI_ADS_VALIDATE_ONLY=true can be used for a temporary validation run.
// The OpenAI Ads Pixel ID is public and fixed for Egleze.
// The Supabase anon key below is public by design (same as api/story.js).
// ─────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';
const OPENAI_ADS_PIXEL_ID = '7phwvegDeCKo3nKMavCkeL';
const CANONICAL_SITE_ORIGIN = 'https://egleze.com';

// What a new signup is subscribed to (matches the beehiiv-sync defaults —
// they asked for "the Digest", which is the daily + the weekly).
// Flip these if the editorial decision changes.
const DEFAULT_PREFS = { pref_daily: true, pref_weekly: true, pref_breaking: false };

// Decision (June 2026): Option A — double opt-in ON, then welcome.
// Flow: signup → Beehiiv confirmation email → click → welcome email.
// Welcome is written + enabled in Beehiiv. (beehiiv-sync.js keeps both
// off, so backfills/syncs never re-confirm or re-greet existing people —
// only fresh organic signups go through this flow.)
const DOUBLE_OPT = 'on';

function validEmail(e) {
  return typeof e === 'string' && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function cleanSource(s) {
  if (typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s)) return s;
  return 'website'; // table default, used if the caller sends nothing usable
}

function validEventId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookieValue(req, name) {
  const raw = (req.headers && req.headers.cookie) || '';
  const prefix = name + '=';
  for (const part of raw.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length) || undefined;
    }
  }
  return undefined;
}

function trustedSourceUrl(req, browserSourceUrl) {
  const candidates = [browserSourceUrl, (req.headers && req.headers.referer) || ''];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      const allowed = u.protocol === 'https:' && (u.hostname === 'egleze.com' || u.hostname === 'www.egleze.com');
      if (allowed) return u.origin + u.pathname;
    } catch (_) {}
  }
  return CANONICAL_SITE_ORIGIN + '/';
}

function opprefFromRequest(req) {
  return cookieValue(req, '__oppref');
}

function clientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return undefined;
}

async function reportOpenAISubscription(req, email, adsContext) {
  const apiKey = process.env.OPENAI_ADS_CAPI_KEY;
  if (!apiKey || !adsContext || adsContext.consent !== true) return;

  try {
    const event = {
      id: validEventId(adsContext.eventId) ? adsContext.eventId : 'sub_' + crypto.randomUUID(),
      type: 'subscription_created',
      timestamp_ms: Date.now(),
      source_url: trustedSourceUrl(req, adsContext.sourceUrl),
      action_source: 'web',
      user: {
        email_sha256: sha256(email),
      },
      data: {
        type: 'plan_enrollment',
      },
    };

    const oppref = opprefFromRequest(req);
    if (oppref) event.oppref = oppref;

    const obref = cookieValue(req, '__obref');
    if (obref) event.user.obref = obref;

    const ip = clientIp(req);
    if (ip) event.user.ip_address = ip;

    const ua = req.headers && req.headers['user-agent'];
    if (typeof ua === 'string' && ua.trim()) event.user.user_agent = ua.trim();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch('https://bzr.openai.com/v1/events?pid=' + encodeURIComponent(OPENAI_ADS_PIXEL_ID), {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          validate_only: process.env.OPENAI_ADS_VALIDATE_ONLY === 'true',
          events: [event],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.error('[subscribe] OpenAI Ads CAPI failed', response.status);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('[subscribe] OpenAI Ads CAPI exception', err && err.name ? err.name : 'error');
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = req.body || {};
    const email = (body.email || '').toString().trim().toLowerCase();
    const source = cleanSource(body.source);
    const adsContext = {
      eventId: body._openaiAdsEventId,
      sourceUrl: body._openaiAdsSourceUrl,
      consent: body._openaiAdsConsent === true,
    };

    if (!validEmail(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }

    // ── 1. Supabase: our own record, never skipped ────────────────
    const sb = await fetch(SUPABASE_URL + '/rest/v1/subscribers', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email: email,
        source: source,
        status: 'active',
        created_at: new Date().toISOString(),
      }),
    });
    if (!sb.ok && sb.status !== 409) {
      const t = await sb.text();
      console.error('[subscribe] supabase insert failed', sb.status, t.slice(0, 200));
      return res.status(500).json({ ok: false, error: 'capture_failed' });
    }

    // ── 2. Beehiiv: instant delivery (best-effort) ────────────────
    const BEEHIIV_KEY = process.env.BEEHIIV_API_KEY;
    const BEEHIIV_PUB = process.env.BEEHIIV_PUBLICATION_ID;
    if (BEEHIIV_KEY && BEEHIIV_PUB) {
      try {
        const bh = await fetch(
          'https://api.beehiiv.com/v2/publications/' + BEEHIIV_PUB + '/subscriptions',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + BEEHIIV_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email: email,
              reactivate_existing: true,
              send_welcome_email: true,
              double_opt_override: DOUBLE_OPT,
              utm_source: source,
              custom_fields: [
                { name: 'pref_daily', value: DEFAULT_PREFS.pref_daily },
                { name: 'pref_weekly', value: DEFAULT_PREFS.pref_weekly },
                { name: 'pref_breaking', value: DEFAULT_PREFS.pref_breaking },
              ],
            }),
          }
        );
        if (!bh.ok && bh.status !== 409) {
          const t = await bh.text();
          console.error('[subscribe] beehiiv push failed', bh.status, t.slice(0, 200));
        }
      } catch (e) {
        console.error('[subscribe] beehiiv exception', e.message);
      }
    } else {
      console.error('[subscribe] BEEHIIV env vars missing — captured to Supabase only');
    }

    // ── 3. OpenAI Ads: server-side subscription conversion ───────
    // Supabase capture is the success boundary. Pixel+CAPI share event_id.
    await reportOpenAISubscription(req, email, adsContext);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[subscribe] error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
