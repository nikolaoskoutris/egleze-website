// /js/follows.js — Egleze follow library (shows + topic categories).
// Load AFTER /js/auth.js (and signin-modal.js for the logged-out prompt).
// Mirrors the proven bookmarks.js pattern exactly: capture-phase click
// delegation on .eg-follow[data-follow-type][data-follow-value], optimistic
// UI with rollback, pending-follow replay after sign-in.
//
// Exposes:
//   window.egleze.follows.shows   (Set of followed show names)
//   window.egleze.follows.topics  (Set of followed topic values)
//   window.egleze.follows.isFollowing(type, value)
//   window.egleze.follows.toggle(type, value)
//   window.egleze.follows.reload()
//   window.egleze.follows.sync()
//   window.egleze.follows.onChange(cb)

(function () {
  window.egleze = window.egleze || {};
  var F = window.egleze.follows = {
    shows: new Set(),
    topics: new Set(),
    isFollowing: isFollowing,
    toggle: toggleFollow,
    reload: loadFollows,
    sync: syncAll,
    onChange: onChange
  };

  var _listeners = [];
  function onChange(cb) { _listeners.push(cb); }
  function emit() { for (var i = 0; i < _listeners.length; i++) { try { _listeners[i](); } catch (e) {} } }

  function getDB() { return (window.egleze.auth && window.egleze.auth.client) || null; }
  function setFor(type) { return type === 'show' ? F.shows : F.topics; }
  function isFollowing(type, value) { return setFor(type).has(String(value)); }

  function whenReady(cb) {
    var tries = 0;
    (function check() {
      if (window.egleze && window.egleze.auth && window.egleze.auth.client) return cb();
      if (tries++ < 50) setTimeout(check, 100);
      else console.warn('[egleze follows] auth client never ready');
    })();
  }

  async function loadFollows() {
    try {
      var auth = window.egleze.auth;
      if (!auth) return;
      var user = await auth.getUser();
      var db = getDB();
      if (!user || !db) { F.shows.clear(); F.topics.clear(); syncAll(); emit(); return; }
      var res = await db.from('user_follows').select('follow_type,follow_value').eq('user_id', user.id);
      if (res.error) { console.error('[egleze follows] load error:', res.error); return; }
      F.shows.clear(); F.topics.clear();
      (res.data || []).forEach(function (r) {
        (r.follow_type === 'show' ? F.shows : F.topics).add(String(r.follow_value));
      });
      syncAll(); emit();
    } catch (e) { console.error('[egleze follows] load exception:', e); }
  }

  function syncAll() {
    try {
      var els = document.querySelectorAll('.eg-follow[data-follow-type][data-follow-value]');
      for (var i = 0; i < els.length; i++) {
        var t = els[i].getAttribute('data-follow-type');
        var v = els[i].getAttribute('data-follow-value');
        els[i].classList.toggle('is-following', setFor(t).has(String(v)));
      }
    } catch (e) { console.error('[egleze follows] sync exception:', e); }
  }

  async function toggleFollow(type, value) {
    value = String(value);
    if (!type || !value) return;
    if (!window.egleze.auth) { console.error('[egleze follows] no auth'); return; }
    var user = await window.egleze.auth.getUser();
    if (!user) {
      try { localStorage.setItem('egleze_pending_follow', JSON.stringify({ t: type, v: value })); } catch (_) {}
      if (window.egleze.ui && window.egleze.ui.openSignIn) window.egleze.ui.openSignIn();
      return;
    }
    var db = getDB();
    if (!db) { console.error('[egleze follows] auth client unavailable'); return; }

    var set = setFor(type);
    var was = set.has(value);

    // optimistic
    if (was) set.delete(value); else set.add(value);
    syncAll(); emit();

    if (was) {
      var del = await db.from('user_follows').delete()
        .eq('user_id', user.id).eq('follow_type', type).eq('follow_value', value);
      if (del.error) {
        set.add(value); syncAll(); emit();
        console.error('[egleze follows] unfollow failed:', del.error);
      }
    } else {
      var ins = await db.from('user_follows').insert({ user_id: user.id, follow_type: type, follow_value: value });
      if (ins.error && ins.error.code !== '23505') { // 23505 = already following (race)
        set.delete(value); syncAll(); emit();
        console.error('[egleze follows] follow failed:', ins.error);
      }
    }
  }

  async function applyPending() {
    try {
      var raw = null;
      try { raw = localStorage.getItem('egleze_pending_follow'); } catch (_) {}
      if (!raw) return;
      try { localStorage.removeItem('egleze_pending_follow'); } catch (_) {}
      var p = JSON.parse(raw);
      if (p && p.t && p.v && !isFollowing(p.t, p.v)) await toggleFollow(p.t, p.v);
    } catch (e) { console.error('[egleze follows] applyPending exception:', e); }
  }

  // capture-phase delegation so card/chip handlers don't swallow the click
  document.addEventListener('click', function (e) {
    try {
      var btn = e.target.closest && e.target.closest('.eg-follow');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      toggleFollow(btn.getAttribute('data-follow-type'), btn.getAttribute('data-follow-value'));
    } catch (err) { console.error('[egleze follows] click exception:', err); }
  }, true);

  whenReady(function () {
    loadFollows().then(applyPending);
    if (window.egleze.auth && window.egleze.auth.onChange) {
      window.egleze.auth.onChange(function (p) {
        if (p && p.event === 'SIGNED_IN') loadFollows().then(applyPending);
        else if (p && p.event === 'SIGNED_OUT') { F.shows.clear(); F.topics.clear(); syncAll(); emit(); }
      });
    }
    try {
      var d;
      var mo = new MutationObserver(function () { clearTimeout(d); d = setTimeout(syncAll, 80); });
      mo.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
  });
})();
