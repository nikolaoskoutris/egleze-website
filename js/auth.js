// /js/auth.js — Egleze auth foundation
// Loaded on every public page. Exposes window.egleze.auth.*

(function () {
  const SUPABASE_URL = "https://kerijdhiasrvaxssjqqg.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg";

  if (!window.supabase) {
    console.error("[egleze] supabase-js script missing — load CDN before auth.js");
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  async function getUser() {
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data.user || null;
  }

  async function getSession() {
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  function onChange(cb) {
    return client.auth.onAuthStateChange((event, session) => {
      cb({ event, session, user: session?.user || null });
    });
  }

  async function signInWithGoogle(redirectTo) {
    return client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo || window.location.origin },
    });
  }

  async function signInWithApple(redirectTo) {
    return client.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: redirectTo || window.location.origin },
    });
  }

  async function signInWithMagicLink(email, redirectTo) {
    return client.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectTo || window.location.origin,
        shouldCreateUser: true,
      },
    });
  }

  async function signOut() {
    return client.auth.signOut();
  }

  window.egleze = window.egleze || {};
  window.egleze.auth = {
    client,
    getUser,
    getSession,
    onChange,
    signInWithGoogle,
    signInWithApple,
    signInWithMagicLink,
    signOut,
  };
})();

// OpenAI Ads conversion measurement.
// This is intentionally consent-gated to the site's existing egleze_cookie
// choice. The CAPI secret never appears in browser code. The browser and
// server use the same event_id for subscription_created deduplication.
(function installOpenAIAdsMeasurement() {
  const PIXEL_ID = '7phwvegDeCKo3nKMavCkeL';
  const SDK_URL = 'https://bzrcdn.openai.com/sdk/oaiq.min.js';
  const nativeFetch = window.fetch && window.fetch.bind(window);
  if (!nativeFetch) return;

  function hasMeasurementConsent() {
    try {
      return localStorage.getItem('egleze_cookie') === 'accepted';
    } catch (_) {
      return false;
    }
  }

  function ensurePixel() {
    if (!hasMeasurementConsent()) return false;
    if (!window.oaiq) {
      var q = function () { q.q.push(arguments); };
      q.q = [];
      window.oaiq = q;
      var js = document.createElement('script');
      js.async = true;
      js.src = SDK_URL;
      var first = document.getElementsByTagName('script')[0];
      if (first && first.parentNode) first.parentNode.insertBefore(js, first);
      else document.head.appendChild(js);
      window.oaiq('init', { pixelId: PIXEL_ID });
    }
    return true;
  }

  function newEventId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'sub_' + window.crypto.randomUUID();
    }
    return 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 14);
  }

  function isSubscribeRequest(input, init) {
    var method = (init && init.method) || (input && input.method) || 'GET';
    if (String(method).toUpperCase() !== 'POST') return false;
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    try {
      var parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin && parsed.pathname === '/api/subscribe';
    } catch (_) {
      return false;
    }
  }

  function addAdsContext(init, eventId) {
    if (!init || typeof init.body !== 'string') return init;
    var contentType = '';
    try {
      var headers = new Headers(init.headers || {});
      contentType = headers.get('content-type') || '';
    } catch (_) {}
    if (contentType && !/application\/json/i.test(contentType)) return init;

    try {
      var body = JSON.parse(init.body);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return init;
      body._openaiAdsEventId = eventId;
      body._openaiAdsSourceUrl = window.location.origin + window.location.pathname;
      body._openaiAdsConsent = hasMeasurementConsent();
      return Object.assign({}, init, { body: JSON.stringify(body) });
    } catch (_) {
      return init;
    }
  }

  ensurePixel();

  window.fetch = async function (input, init) {
    if (!isSubscribeRequest(input, init)) return nativeFetch(input, init);

    var eventId = newEventId();
    var requestInit = addAdsContext(init || {}, eventId);
    var response = await nativeFetch(input, requestInit);

    if (response && response.ok && ensurePixel()) {
      try {
        window.oaiq(
          'measure',
          'subscription_created',
          { type: 'plan_enrollment' },
          { event_id: eventId }
        );
      } catch (_) {}
    }
    return response;
  };
})();

(function normalizeBroadcastBrandMark() {
  function applyBrandMark() {
    const mark = document.querySelector('.bc-e-mark');
    if (!mark || mark.querySelector('img')) return;

    const image = document.createElement('img');
    image.src = '/favicon-96x96.png';
    image.alt = '';
    image.width = 30;
    image.height = 30;
    image.decoding = 'async';
    image.style.cssText = 'display:block;width:30px;height:30px;border-radius:50%;object-fit:cover';

    mark.textContent = '';
    mark.style.background = 'transparent';
    mark.appendChild(image);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrandMark, { once: true });
  } else {
    applyBrandMark();
  }
})();
