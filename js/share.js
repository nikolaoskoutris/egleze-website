// /js/share.js — Egleze share shared library
// Loaded on any page that needs share buttons. Standalone (no auth dependency).
//
// Pattern: capture-phase click delegation on .eg-share[data-story-id]
//   - Native: navigator.share({title, url}) when supported (most mobile)
//   - Fallback: copy URL to clipboard, show small toast
// Optional attributes on the button to customize what gets shared:
//   data-share-url    (defaults to current page URL)
//   data-share-title  (defaults to document.title)
//   data-share-text   (defaults to title)
// Anyone can share — NO login required (this is the engagement funnel).

(function () {
  function getShareData(btn) {
    var url = btn.getAttribute('data-share-url') || window.location.href;
    var title = btn.getAttribute('data-share-title') || document.title || 'Egleze';
    var text = btn.getAttribute('data-share-text') || title;
    return { url: url, title: title, text: text };
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    // legacy fallback
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
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);'
      + 'background:#111;color:#fff;padding:10px 18px;border-radius:24px;'
      + 'font-family:"DM Sans",sans-serif;font-size:13px;z-index:100000;'
      + 'box-shadow:0 6px 24px rgba(0,0,0,.25);opacity:0;transition:opacity .15s';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = '1'; });
    setTimeout(function () {
      t.style.opacity = '0';
      setTimeout(function () { try { t.remove(); } catch (_) {} }, 200);
    }, 1800);
  }

  async function doShare(btn) {
    var d = getShareData(btn);
    // Try native share first (mobile + many desktop browsers)
    if (navigator.share) {
      try {
        await navigator.share({ title: d.title, text: d.text, url: d.url });
        return; // success
      } catch (e) {
        // user cancelled - don't fall through to clipboard
        if (e && (e.name === 'AbortError' || /abort|cancel/i.test(e.message || ''))) return;
        // anything else - fall through to clipboard
      }
    }
    // Fallback: copy to clipboard
    var ok = await copyToClipboard(d.url);
    showToast(ok ? 'Link copied' : 'Could not copy link');
  }

  document.addEventListener('click', function (e) {
    try {
      var btn = e.target.closest && e.target.closest('.eg-share');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      doShare(btn);
    } catch (err) {
      console.error('[egleze share] click exception:', err);
    }
  }, true);

  window.egleze = window.egleze || {};
  window.egleze.share = { trigger: doShare };
})();
