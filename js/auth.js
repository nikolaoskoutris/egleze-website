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

  async function signInWithGoogle(redirectTo) {
    return client.auth.signInWithOAuth({
      provider: "google",
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
    signInWithMagicLink,
    signOut,
  };
})();
