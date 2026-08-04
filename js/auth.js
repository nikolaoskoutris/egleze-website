// /js/auth.js — Egleze auth foundation
// Loaded on every public page. Exposes window.egleze.auth.*

(function () {
  const SUPABASE_URL = "https://kerijdhiasrvaxssjqqg.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXAiLCJyZWYiOiJrZXJpamRoaWFzcnZheHNzanFxZyIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzc3NjIyMTk5LCJleHAiOjIwOTMxOTgxOTl9.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg";

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

  async function signInWithGoogle(redirectTo) {
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
