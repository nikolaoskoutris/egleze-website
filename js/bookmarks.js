// /js/bookmarks.js — Egleze bookmarks shared library
// Loaded on any page that needs bookmark functionality. Load AFTER /js/auth.js.
//
// Pattern: capture-phase click delegation on any element matching .eg-bookmark[data-story-id]
// Exposes: window.egleze.saved (Set of saved story ids as strings)
//
// Faithful extraction of the proven homepage logic — same DB table, same RLS,
// same optimistic UI, same pending-save replay after sign-in. New pages get
// identical behavior; existing homepage code can later switch to this lib
// without any user-visible change.

(function () {
  window.egleze = window.egleze || {};
  window.egleze.saved = new Set();

  function getDB() {
    return (window.egleze.auth && window.egleze.auth.client) || null;
  }

  function whenReady(cb) {
    var tries = 0;
    (function check() {
      if (window.egleze && window.egleze.auth && window.egleze.auth.client) return cb();
      if (tries++ < 50) setTimeout(check, 100);
      else console.warn('[egleze bookmarks] auth client never ready');
    })();
  }

  async function loadSavedIds() {
    try {
      var auth = window.egleze.auth;
      if (!auth) return;
      var user = await auth.getUser();
      var db = getDB();
      if (!user || !db) {
        window.egleze.saved.clear();
        syncAllBookmarks();
        return;
      }
      var res = await db.from('user_saved_stories').select('story_id').eq('user_id', user.id);
      if (res.error) {
        console.error('[egleze bookmarks] loadSavedIds error:', res.error);
        return;
      }
      window.egleze.saved = new Set((res.data || []).map(function (r) { return String(r.story_id); }));
      syncAllBookmarks();
    } catch (e) {
      console.error('[egleze bookmarks] loadSavedIds exception:', e);
    }
  }

  function syncAllBookmarks() {
    try {
      var set = window.egleze.saved;
      var els = document.querySelectorAll('.eg-bookmark[data-story-id]');
      for (var i = 0; i < els.length; i++) {
        var id = els[i].getAttribute('data-story-id');
        if (!id) continue;
        els[i].classList.toggle('is-saved', set.has(String(id)));
      }
    } catch (e) {
      console.error('[egleze bookmarks] syncAllBookmarks exception:', e);
    }
  }

  async function toggleBookmark(storyId) {
    if (!storyId) return;
    storyId = String(storyId);
    if (!window.egleze.auth) { console.error('[egleze bookmarks] no auth'); return; }
    var user = await window.egleze.auth.getUser();
    if (!user) {
      // remember the intent and prompt sign-in (modal must be available on the page)
      try { localStorage.setItem('egleze_pending_save', storyId); } catch (_) {}
      if (window.egleze.ui && window.egleze.ui.openSignIn) {
        window.egleze.ui.openSignIn();
      }
      return;
    }
    var db = getDB();
    if (!db) { console.error('[egleze bookmarks] auth client not available'); return; }

    var set = window.egleze.saved;
    var wasSaved = set.has(storyId);
    var els = document.querySelectorAll('.eg-bookmark[data-story-id="' + storyId + '"]');

    // optimistic UI
    for (var i = 0; i < els.length; i++) els[i].classList.toggle('is-saved', !wasSaved);

    if (wasSaved) {
      set.delete(storyId);
      var del = await db.from('user_saved_stories').delete()
        .eq('user_id', user.id).eq('story_id', parseInt(storyId, 10));
      if (del.error) {
        console.error('[egleze bookmarks] unsave failed:', del.error);
        set.add(storyId);
        for (var j = 0; j < els.length; j++) els[j].classList.add('is-saved');
      }
    } else {
      set.add(storyId);
      var ins = await db.from('user_saved_stories').insert({
        user_id: user.id, story_id: parseInt(storyId, 10)
      });
      if (ins.error && ins.error.code !== '23505') {  // 23505 = unique violation = already saved (race)
        console.error('[egleze bookmarks] save failed:', ins.error);
        set.delete(storyId);
        for (var k = 0; k < els.length; k++) els[k].classList.remove('is-saved');
      }
    }
  }

  async function applyPendingSave() {
    try {
      var pending = null;
      try { pending = localStorage.getItem('egleze_pending_save'); } catch (_) {}
      if (!pending) return;
      try { localStorage.removeItem('egleze_pending_save'); } catch (_) {}
      var db = getDB();
      if (!window.egleze.auth || !db) return;
      var user = await window.egleze.auth.getUser();
      if (!user) return;
      var ins = await db.from('user_saved_stories').insert({
        user_id: user.id, story_id: parseInt(pending, 10)
      });
      if (ins.error && ins.error.code !== '23505') {
        console.error('[egleze bookmarks] applyPendingSave failed:', ins.error);
        return;
      }
      window.egleze.saved.add(String(pending));
      syncAllBookmarks();
    } catch (e) {
      console.error('[egleze bookmarks] applyPendingSave exception:', e);
    }
  }

  // Capture-phase click delegation so card-level click handlers don't swallow it
  document.addEventListener('click', function (e) {
    try {
      var btn = e.target.closest && e.target.closest('.eg-bookmark');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var id = btn.getAttribute('data-story-id');
      if (!id) return;
      toggleBookmark(id);
    } catch (err) {
      console.error('[egleze bookmarks] click exception:', err);
    }
  }, true);

  // Init when auth client is ready; re-sync on sign-in/out and on DOM changes.
  whenReady(function () {
    loadSavedIds().then(applyPendingSave);
    if (window.egleze.auth && window.egleze.auth.onChange) {
      window.egleze.auth.onChange(function (payload) {
        try {
          if (payload && payload.event === 'SIGNED_IN') {
            loadSavedIds().then(applyPendingSave);
          } else if (payload && payload.event === 'SIGNED_OUT') {
            window.egleze.saved.clear();
            syncAllBookmarks();
          }
        } catch (e) { console.error('[egleze bookmarks] onChange exception:', e); }
      });
    }
    // re-sync as new bookmark buttons appear in the DOM (debounced)
    try {
      var debounce;
      var observer = new MutationObserver(function () {
        clearTimeout(debounce);
        debounce = setTimeout(syncAllBookmarks, 80);
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* MutationObserver unavailable - non-fatal */ }
  });

  // expose for external rescan / tests
  window.egleze.bookmarks = {
    toggle: toggleBookmark,
    sync: syncAllBookmarks,
    reload: loadSavedIds
  };
})();
