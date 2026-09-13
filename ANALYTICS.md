# Egleze analytics architecture

Egleze deliberately keeps three measurements separate:

1. **First-party pulse** counts browser page loads and a small allowlist of product events for every consent state. It is cookie-free, removes query strings from paths, stores referral hostnames instead of full URLs, records only a coarse device category and country, and never stores raw IP addresses, full user-agent strings, email addresses or fingerprint data.
2. **Vercel Web Analytics** supplies an independent cookie-free estimate of pageviews and visitors. Its visitor estimate is displayed separately from first-party page loads.
3. **Google Analytics 4** is optional and loads only after the visitor accepts analytics. Its session counts are therefore expected to be lower.

The Situation Room must never label page loads, consented sessions or anonymous visitor estimates as exact people, and these values must not be added together.

## Deployment requirements

### Website project

- Apply `supabase/migrations/20260913_001_analytics_foundation.sql`.
- Set `SUPABASE_SERVICE_ROLE_KEY` as a server-only Vercel environment variable for Production and Preview. Never expose it in HTML or browser JavaScript.
- Enable Web Analytics in the Vercel project. The shared client loads `/_vercel/insights/script.js`; if Vercel supplies a project-specific resilient script route, set it before `/js/pulse.js` as `window.EGLEZE_VERCEL_ANALYTICS_SCRIPT`.

### Dashboard project

- Keep the existing Supabase server variables.
- Add a read-only `VERCEL_ACCESS_TOKEN` so `/api/analytics` can query the website project's production Web Analytics counts.
- `VERCEL_ANALYTICS_PROJECT_ID` and `VERCEL_ANALYTICS_TEAM_ID` are optional overrides; the current website IDs are the defaults in the route.

## Privacy and retention

- The browser posts to the same-origin `/api/pulse` boundary.
- The server validates the origin, drops known bots and prefetches, rate-limits with an ephemeral salted hash (never the raw IP) and applies field/property allowlists.
- A random per-tab session UUID is accepted only after explicit analytics consent.
- Browser roles have no direct table access; only the server service role can insert/read.
- First-party events are deleted automatically after 180 days by `pg_cron`.

## Verification

After preview deployment:

1. Visit a homepage, story, episode, topic and show page with optional analytics rejected.
2. Confirm one `page_view` per page in `analytics_events`, with no `session_id`.
3. Accept analytics and repeat; confirm GA4 loads and the new first-party events carry only a random per-tab `session_id`.
4. Confirm query strings are absent from `path`, referral values contain only hostnames and no raw IP/full user-agent/email fields exist.
5. Open the Situation Room and verify the 5-minute page-load card updates after refresh.
