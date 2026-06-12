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
// The Supabase anon key below is public by design (same as api/story.js).
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

// What a new signup is subscribed to (matches the beehiiv-sync defaults —
// they asked for "the Digest", which is the daily + the weekly).
// Flip these if the editorial decision changes.
const DEFAULT_PREFS = { pref_daily: true, pref_weekly: true, pref_breaking: false };

// 'off' = no confirmation email (matches existing beehiiv-sync behaviour).
// If marketing wants the "watch for a confirmation email" copy to be true,
// change to 'on' — Beehiiv will then send the double-opt-in confirmation.
const DOUBLE_OPT = 'off';

function validEmail(e) {
  return typeof e === 'string' && e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

function cleanSource(s) {
  if (typeof s === 'string' && /^[a-z0-9_-]{1,40}$/i.test(s)) return s;
  return 'website'; // table default, used if the caller sends nothing usable
}

module.exports = async (req, res) => {
  // Same-origin POSTs only; everything else is a 405.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const body = req.body || {};
    const email = (body.email || '').toString().trim().toLowerCase();
    const source = cleanSource(body.source);

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
              send_welcome_email: false,
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
          // Captured in Supabase regardless; the sync backfill will repair.
          console.error('[subscribe] beehiiv push failed', bh.status, t.slice(0, 200));
        }
      } catch (e) {
        console.error('[subscribe] beehiiv exception', e.message);
      }
    } else {
      console.error('[subscribe] BEEHIIV env vars missing — captured to Supabase only');
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[subscribe] error:', err);
    return res.status(500).json({ ok: false, error: 'server_error' });
  }
};
