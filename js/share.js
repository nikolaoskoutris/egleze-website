// /js/share.js — Egleze share shared library (v2: matches homepage dropdown)
// Click on any .eg-share[data-story-id] opens a small popover with:
//   - "Copy link" (always shown)
//   - "Share via apps…" (only if navigator.share is supported)
// Faithful replication of the homepage share dropdown UX so the experience
// is identical on every page.
//
// Buttons may carry optional attributes to customise what gets shared:
//   data-share-url    (defaults to current page URL)
//   data-share-title  (defaults to document.title)
//   data-share-text   (defaults to title)
// No login required — share is the engagement funnel.

(function () {
  function getShareData(btn) {
    return {
      url: btn.getAttribute('data-share-url') || window.location.href,
      title: btn.getAttribute('data-share-title') || document.title || 'Egleze',
      text: btn.getAttribute('data-share-text') || btn.getAttribute('data-share-title') || document.title || 'Egleze'
    };
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function showToast(msg) {
    var t = document.getElementById('eg-share-toast');
    if (t) try { t.remove(); } catch (_) {}
    t = document.createElement('div');
    t.id = 'eg-share-toast';
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);'
      + 'background:#0e0a06;color:#fff;padding:11px 18px;border-radius:6px;'
      + 'font-family:"DM Sans",sans-serif;font-size:13px;z-index:10000;'
      + 'box-shadow:0 8px 28px rgba(0,0,0,.28);opacity:0;transition:opacity .2s,transform .2s';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { try { t.remove(); } catch (_) {} }, 220);
    }, 1800);
  }

  function closeSharePopover() {
    var existing = document.getElementById('eg-share-popover');
    if (existing) try { existing.remove(); } catch (_) {}
    document.removeEventListener('click', onPopoverOutsideClick, true);
    document.removeEventListener('keydown', onPopoverKeyDown, true);
  }
  function onPopoverOutsideClick(e) {
    var pop = document.getElementById('eg-share-popover');
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest && e.target.closest('.eg-share')) return;
    closeSharePopover();
  }
  function onPopoverKeyDown(e) { if (e.key === 'Escape') closeSharePopover(); }

  function openSharePopover(btn) {
    closeSharePopover();
    var data = getShareData(btn);
    var rect = btn.getBoundingClientRect();
    var pop = document.createElement('div');
    pop.id = 'eg-share-popover';
    pop.setAttribute('role', 'menu');
    pop.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid rgba(0,0,0,.12);'
      + 'box-shadow:0 8px 28px rgba(0,0,0,.18);border-radius:6px;min-width:200px;padding:6px;'
      + 'font-family:"DM Sans",sans-serif';
    // Position below the button, right-aligned to it (same as homepage).
    pop.style.top = (rect.bottom + 6) + 'px';
    pop.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';

    var itemStyle = 'display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;'
      + 'background:none;border:none;font-size:13px;color:#1a1a1a;text-align:left;cursor:pointer;'
      + 'border-radius:4px;font-family:inherit';

    // Copy link (always)
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.setAttribute('role', 'menuitem');
    copyBtn.style.cssText = itemStyle;
    copyBtn.onmouseover = function () { copyBtn.style.background = '#f5f3ed'; };
    copyBtn.onmouseout = function () { copyBtn.style.background = 'none'; };
    copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg><span>Copy link</span>';
    copyBtn.onclick = async function () {
      try {
        var ok = await copyToClipboard(data.url);
        showToast(ok ? 'Link copied to clipboard' : 'Could not copy link');
      } catch (err) {
        console.error('[egleze share] copy failed:', err);
        showToast('Could not copy link');
      } finally {
        closeSharePopover();
      }
    };
    pop.appendChild(copyBtn);

    // Share via apps (only if supported)
    if (navigator.share) {
      var shareBtn = document.createElement('button');
      shareBtn.type = 'button';
      shareBtn.setAttribute('role', 'menuitem');
      shareBtn.style.cssText = itemStyle;
      shareBtn.onmouseover = function () { shareBtn.style.background = '#f5f3ed'; };
      shareBtn.onmouseout = function () { shareBtn.style.background = 'none'; };
      shareBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span>Share via apps…</span>';
      shareBtn.onclick = async function () {
        closeSharePopover();
        try {
          await navigator.share({ title: data.title, text: data.text, url: data.url });
        } catch (e) {
          if (e && (e.name === 'AbortError' || /abort|cancel/i.test(e.message || ''))) return;
          // fallback to clipboard if native share errored
          var ok = await copyToClipboard(data.url);
          if (ok) showToast('Link copied to clipboard');
        }
      };
      pop.appendChild(shareBtn);
    }

    document.body.appendChild(pop);
    // attach outside-click + esc listeners on next tick so the opening click
    // doesn't immediately close the popover
    setTimeout(function () {
      document.addEventListener('click', onPopoverOutsideClick, true);
      document.addEventListener('keydown', onPopoverKeyDown, true);
    }, 0);
  }

  // capture-phase click delegation
  document.addEventListener('click', function (e) {
    try {
      var btn = e.target.closest && e.target.closest('.eg-share');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      openSharePopover(btn);
    } catch (err) {
      console.error('[egleze share] click exception:', err);
    }
  }, true);

  window.egleze = window.egleze || {};
  window.egleze.share = { open: openSharePopover, close: closeSharePopover };
})();
