// /js/reactions.js — Egleze reactions layer
// Loaded on every public page AFTER /js/auth.js. Exposes window.egleze.reactions.*
// Mirrors the proven window.egleze.saved (bookmarks) pattern exactly:
//  - waits for the shared auth client
//  - uses window.egleze.auth.client for writes (carries user JWT -> RLS applies)
//  - public totals via get_story_reactions() RPC (SECURITY DEFINER, works logged-out)
//  - logged-out write -> opens existing sign-in modal (window.egleze.ui.openSignIn)
//  - optimistic UI with rollback on error
//
// Privacy contract enforced server-side (RLS + SECURITY DEFINER); this client
// NEVER receives another user's rows. It only ever reads its own reactions and
// suppressed aggregate totals.

(function () {
  var REACTION_KEYS = ['inspires', 'concerns', 'curious', 'changed', 'validates'];
  var MAX_INTENSITY = 5; // 5-point scale (see spec rationale). DB CHECK must match.

  window.egleze = window.egleze || {};
  window.egleze.reactions = {
    keys: REACTION_KEYS,
    maxIntensity: MAX_INTENSITY,
    _mine: {},       // { storyId: { reaction: intensity } } for the current user
    _totals: {},     // { storyId: [{reaction,total,avg_intensity,display}] }
    setForStory: setForStory,
    clearForStory: clearForStory,
    getTotals: getTotals,
    getMine: getMine,
    refreshTotals: refreshTotals,
    onChange: onChange
  };

  var _listeners = [];
  function onChange(cb) { _listeners.push(cb); }
  function _emit(storyId) {
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](String(storyId)); } catch (e) {}
    }
  }

  function getDB() {
    return (window.egleze.auth && window.egleze.auth.client) || null;
  }

  function whenReady(cb) {
    var tries = 0;
    (function check() {
      if (window.egleze && window.egleze.auth && window.egleze.auth.client) return cb();
      if (tries++ < 50) setTimeout(check, 100);
      else console.warn('[egleze reactions] auth client never ready');
    })();
  }

  // ---- public totals (works for anyone, logged in or not) ----
  async function refreshTotals(storyId) {
    storyId = parseInt(storyId, 10);
    if (!storyId) return;
    var db = getDB();
    if (!db) return;
    try {
      var res = await db.rpc('get_story_reactions', { p_story_id: storyId });
      if (res.error) {
        console.error('[egleze reactions] totals rpc error:', res.error);
        return;
      }
      window.egleze.reactions._totals[String(storyId)] = res.data || [];
      _emit(storyId);
    } catch (e) {
      console.error('[egleze reactions] refreshTotals exception:', e);
    }
  }

  function getTotals(storyId) {
    return window.egleze.reactions._totals[String(storyId)] || null;
  }
  function getMine(storyId) {
    return window.egleze.reactions._mine[String(storyId)] || {};
  }

  // ---- load THIS user's own reactions for a story (RLS: only own rows) ----
  async function loadMine(storyId) {
    storyId = parseInt(storyId, 10);
    var auth = window.egleze.auth;
    if (!auth) return;
    var user = await auth.getUser();
    var db = getDB();
    if (!user || !db) { window.egleze.reactions._mine[String(storyId)] = {}; return; }
    try {
      var res = await db.from('story_reactions')
        .select('reaction,intensity')
        .eq('user_id', user.id)
        .eq('story_id', storyId);
      if (res.error) { console.error('[egleze reactions] loadMine error:', res.error); return; }
      var map = {};
      (res.data || []).forEach(function (r) { map[r.reaction] = r.intensity; });
      window.egleze.reactions._mine[String(storyId)] = map;
      _emit(storyId);
    } catch (e) {
      console.error('[egleze reactions] loadMine exception:', e);
    }
  }

  // ---- set / change / remove one reaction ----
  // intensity 1..MAX = set; intensity 0 (or null) = remove that reaction.
  async function setForStory(storyId, reaction, intensity) {
    storyId = parseInt(storyId, 10);
    if (!storyId || REACTION_KEYS.indexOf(reaction) === -1) return;

    if (!window.egleze.auth) { console.error('[egleze reactions] no auth'); return; }
    var user = await window.egleze.auth.getUser();
    if (!user) {
      try { localStorage.setItem('egleze_pending_reaction',
              JSON.stringify({ s: storyId, r: reaction, i: intensity })); } catch (_) {}
      if (window.egleze.ui && window.egleze.ui.openSignIn) window.egleze.ui.openSignIn();
      return;
    }
    var db = getDB();
    if (!db) { console.error('[egleze reactions] auth client unavailable'); return; }

    var key = String(storyId);
    var mine = window.egleze.reactions._mine[key] || (window.egleze.reactions._mine[key] = {});
    var prev = mine[reaction];

    // optimistic
    if (!intensity || intensity < 1) delete mine[reaction];
    else mine[reaction] = Math.min(MAX_INTENSITY, Math.max(1, intensity | 0));
    _emit(storyId);

    try {
      var result;
      if (!intensity || intensity < 1) {
        result = await db.from('story_reactions').delete()
          .eq('user_id', user.id).eq('story_id', storyId).eq('reaction', reaction);
      } else {
        result = await db.from('story_reactions')
          .upsert({
            user_id: user.id, story_id: storyId, reaction: reaction,
            intensity: mine[reaction], updated_at: new Date().toISOString()
          }, { onConflict: 'user_id,story_id,reaction' });
      }
      if (result.error) {
        // rollback
        if (prev === undefined) delete mine[reaction]; else mine[reaction] = prev;
        _emit(storyId);
        console.error('[egleze reactions] write failed:', result.error);
        return;
      }
      // refresh public totals so the visible counts update
      refreshTotals(storyId);
    } catch (e) {
      if (prev === undefined) delete mine[reaction]; else mine[reaction] = prev;
      _emit(storyId);
      console.error('[egleze reactions] setForStory exception:', e);
    }
  }

  async function clearForStory(storyId) {
    storyId = parseInt(storyId, 10);
    var mine = getMine(storyId);
    var keys = Object.keys(mine);
    for (var i = 0; i < keys.length; i++) {
      await setForStory(storyId, keys[i], 0);
    }
  }

  // ---- apply a reaction the user attempted before signing in ----
  async function applyPending() {
    var raw;
    try { raw = localStorage.getItem('egleze_pending_reaction'); } catch (_) { return; }
    if (!raw) return;
    try { localStorage.removeItem('egleze_pending_reaction'); } catch (_) {}
    try {
      var p = JSON.parse(raw);
      if (p && p.s && p.r) await setForStory(p.s, p.r, p.i || 3);
    } catch (e) {}
  }

  // ---- init: hydrate on auth state, like bookmarks ----
  whenReady(function () {
    var auth = window.egleze.auth;
    // when a story UI registers interest it calls refreshTotals/loadMine itself;
    // here we just wire the pending-reaction replay after sign-in.
    if (auth && auth.onChange) {
      auth.onChange(function (p) {
        if (p && p.event === 'SIGNED_IN') applyPending();
      });
    }
  });

  // expose for the UI layer
  window.egleze.reactions._loadMine = loadMine;
})();
