// /js/egleze-native.js — activates native app features when running inside Capacitor.
// INERT on the web (no window.Capacitor) — safe to load on shorts.html everywhere.
// Load order on the page: supabase-js → auth.js → (signin-modal, reactions, bookmarks, share) → egleze-native.js
//
// What it does inside the app:
//   1. Haptics — a tick on reactions, category chips, and action buttons.
//   2. External links (YouTube, "Read on Egleze") open in the in-app system browser
//      so the user returns to the app instead of leaving it.
//   3. Google + Apple sign-in + magic link run through the system browser and return
//      via the egleze:// deep link, because OAuth is blocked inside plain webviews.

(function () {
  var Cap = window.Capacitor;
  if (!Cap || typeof Cap.isNativePlatform !== 'function' || !Cap.isNativePlatform()) {
    return; // web build — do nothing
  }

  var P = Cap.Plugins || {};
  var Haptics = P.Haptics, Browser = P.Browser, App = P.App;
  var AUTH_REDIRECT = 'egleze://auth';
  document.documentElement.classList.add('eg-native');

  // ── 1. Haptics ────────────────────────────────────────────────────────────
  function tick(style) { try { if (Haptics) Haptics.impact({ style: style || 'LIGHT' }); } catch (e) {} }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.seg, .chip, .act-btn, [data-sound]');
    if (t) tick(t.classList.contains('seg') ? 'MEDIUM' : 'LIGHT');
  }, true);

  // ── 2. External links → in-app browser ─────────────────────────────────────
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="http"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('egleze://') === 0) return;
    e.preventDefault(); e.stopPropagation();
    try { if (Browser) Browser.open({ url: href, presentationStyle: 'popover' }); else window.open(href, '_blank'); }
    catch (_) { window.open(href, '_blank'); }
  }, true);

  // ── 3. Native auth (OAuth + magic link via system browser + deep-link return) ─
  function client() { return window.egleze && window.egleze.auth && window.egleze.auth.client; }

  // One generic OAuth-through-system-browser helper, used by Google AND Apple.
  // skipBrowserRedirect stops supabase-js redirecting the webview; we open the
  // provider URL in the system browser instead, and the egleze://auth deep link
  // brings the session back (handled by appUrlOpen below, provider-agnostic).
  function nativeOAuth(provider) {
    return async function () {
      try {
        var sb = client();
        var res = await sb.auth.signInWithOAuth({
          provider: provider,
          options: { redirectTo: AUTH_REDIRECT, skipBrowserRedirect: true }
        });
        if (res && res.data && res.data.url && Browser) Browser.open({ url: res.data.url });
        return res;
      } catch (err) { console.error('[egleze-native] ' + provider + ' sign-in failed', err); return { error: err }; }
    };
  }

  function patchAuth() {
    if (!window.egleze || !window.egleze.auth) { return setTimeout(patchAuth, 150); }
    var sb = client();
    if (!sb) { return setTimeout(patchAuth, 150); }

    window.egleze.auth.signInWithGoogle = nativeOAuth('google');
    window.egleze.auth.signInWithApple = nativeOAuth('apple');

    window.egleze.auth.signInWithMagicLink = function (email) {
      return sb.auth.signInWithOtp({
        email: String(email).trim().toLowerCase(),
        options: { emailRedirectTo: AUTH_REDIRECT, shouldCreateUser: true }
      });
    };
  }
  patchAuth();

  if (App && App.addListener) {
    App.addListener('appUrlOpen', async function (data) {
      try {
        var url = data && data.url;
        if (!url || url.indexOf(AUTH_REDIRECT) !== 0) return;
        var sb = client(); if (!sb) return;
        var qs = url.split('?')[1] || '';
        var hs = url.split('#')[1] || '';
        var params = new URLSearchParams(qs || hs);
        if (params.get('code')) {
          await sb.auth.exchangeCodeForSession(params.get('code'));
        } else if (params.get('access_token')) {
          await sb.auth.setSession({
            access_token: params.get('access_token'),
            refresh_token: params.get('refresh_token')
          });
        }
        try { if (Browser) Browser.close(); } catch (_) {}
      } catch (err) { console.error('[egleze-native] auth callback failed', err); }
    });
  }
})();
