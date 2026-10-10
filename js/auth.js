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
      detectSessionInUrl: true, // critical: handles the magic-link callback
    },
  });

  // ----- helpers -----
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

  const OAUTH_PROVIDER_KEY = 'egleze.oauth.provider';
  function markOAuthProvider(provider) {
    try { localStorage.setItem(OAUTH_PROVIDER_KEY, provider); } catch (_) {}
  }

  let appleCapture = null;
  async function storeAppleCredential(session, providerRefreshToken) {
    let provider;
    try { provider = localStorage.getItem(OAUTH_PROVIDER_KEY); } catch (_) {}
    const token = providerRefreshToken || session?.provider_refresh_token;
    if (provider !== 'apple' || !token || !session?.user?.identities?.some(i => i.provider === 'apple')) return;
    if (appleCapture) return appleCapture;
    appleCapture = (async () => {
      const { data, error } = await client.functions.invoke('account-lifecycle', {
        body: { action: 'store-apple-credential', refresh_token: token },
      });
      if (error || data?.stored !== true) throw new Error('Apple account connection could not be saved.');
      try { localStorage.removeItem(OAUTH_PROVIDER_KEY); } catch (_) {}
    })();
    try { await appleCapture; } finally { appleCapture = null; }
  }

  // Run outside the Auth callback lock; never log or persist provider tokens.
  client.auth.onAuthStateChange((event, session) => {
    if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session?.provider_refresh_token) {
      setTimeout(() => { storeAppleCredential(session).catch(() => {}); }, 0);
    }
  });

  function clearAccountData(userId) {
    try {
      localStorage.removeItem('egleze.native.history.v1.' + userId);
      localStorage.removeItem('egleze_pending_save');
      localStorage.removeItem('egleze_session_id');
      localStorage.removeItem(OAUTH_PROVIDER_KEY);
      sessionStorage.removeItem('egleze_session_id');
    } catch (_) {}
    if (window.EglezeHistory) {
      window.EglezeHistory.setIdentity(userId);
      window.EglezeHistory.clearCurrent();
      window.EglezeHistory.setIdentity(null);
    }
  }

  async function deleteAccount(confirmation) {
    if (confirmation !== 'DELETE') throw new Error('Type DELETE to confirm.');
    const user = await getUser();
    if (!user) throw new Error('Please sign in again before deleting your account.');
    // Finish any in-flight Apple credential capture before deleting its owner.
    if (appleCapture) { try { await appleCapture; } catch (_) {} }
    const { data, error } = await client.functions.invoke('account-lifecycle', {
      body: { action: 'delete', confirmation },
    });
    if (error || data?.deleted !== true) {
      let details = data;
      try { if (error?.context) details = await error.context.json(); } catch (_) {}
      if (details?.sign_in_again || details?.error === 'sign_in_required') {
        throw new Error('Deletion was not confirmed. Please sign in again and retry.');
      }
      throw new Error('Deletion was not confirmed. Please try again.');
    }
    try { clearAccountData(user.id); } catch (_) {}
    // Server deletion already succeeded. Local cleanup cannot turn it into a failure.
    try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
    return data;
  }

  async function signInWithGoogle(redirectTo) {
    markOAuthProvider('google');
    return client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo || window.location.origin,
      },
    });
  }

  // Sign in with Apple — same web-OAuth path as Google, so it works identically
  // on the website, the shorts PWA, and (via the native bridge's system-browser
  // + egleze://auth deep link) the iOS/Android apps. Requires the Apple provider
  // to be enabled in Supabase (Services ID as Client ID + generated secret).
  async function signInWithApple(redirectTo) {
    markOAuthProvider('apple');
    return client.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: redirectTo || window.location.origin,
      },
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

  async function signInWithPassword(email, password) {
    return client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
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
    signInWithPassword,
    signOut,
    markOAuthProvider,
    storeAppleCredential,
    deleteAccount,
  };
})();

// Use the official Egleze brand asset in the homepage broadcast station mark.
// The broadcast markup historically rendered a generic text “E”, which did
// not match the masthead/app icon. Keep this defensive because auth.js is
// shared by public pages that do not contain the broadcast player.
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
