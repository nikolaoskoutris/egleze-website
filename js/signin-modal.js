// /js/signin-modal.js — Egleze sign-in modal shared library
// Loaded on any page that needs the sign-in popup. Load AFTER /js/auth.js.
//
// Injects the modal HTML + CSS into the page on load (one-time).
// Exposes window.egleze.ui.openSignIn() / closeSignIn().
// Wires Google OAuth and magic-link via window.egleze.auth.
//
// Faithful reproduction of the proven homepage modal: same DOM ids, same CSS,
// same user-facing copy, same flow. Self-contained so any page just loads
// this one file and gets a working sign-in.

(function () {
  if (document.getElementById('eg-modal')) {
    console.log('[egleze signin-modal] modal already in page, skipping inject');
    return; // already present (e.g. on the homepage)
  }
  console.log('[egleze signin-modal] injecting modal');

  // ---- CSS ----
  var css = '#eg-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .2s}'
    + '#eg-modal.is-shown{display:flex}'
    + '#eg-modal.is-open{opacity:1}'
    + '#eg-modal-backdrop{position:absolute;inset:0;background:rgba(14,10,6,.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}'
    + '#eg-modal-card{position:relative;background:#fff;border-radius:8px;padding:32px 30px 24px;width:100%;max-width:380px;box-shadow:0 12px 36px rgba(0,0,0,.28);transform:translateY(8px);transition:transform .2s;font-family:"DM Sans",-apple-system,sans-serif}'
    + '#eg-modal.is-open #eg-modal-card{transform:translateY(0)}'
    + '#eg-modal-close{position:absolute;top:12px;right:14px;background:none;border:none;color:#aaa;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px}'
    + '#eg-modal-close:hover{color:#0e0a06}'
    + '#eg-modal-logo{font-family:"Playfair Display",Georgia,serif;font-size:30px;font-weight:900;letter-spacing:-1.2px;line-height:1;text-align:center;color:#0e0a06}'
    + '#eg-modal-logo .e-red{color:#bb1919}'
    + '#eg-modal-headline{font-family:"Playfair Display",serif;font-size:18px;font-weight:600;line-height:1.25;text-align:center;margin:16px 0 6px;color:#0e0a06}'
    + '#eg-modal-sub{font-size:12px;color:#777;text-align:center;line-height:1.5;margin:0 0 22px}'
    + '#eg-btn-google{display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 16px;width:100%;background:#fff;color:#0e0a06;border:1px solid #ddd;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit;transition:border-color .15s,background .15s}'
    + '#eg-btn-google:hover{border-color:#bb1919;background:#fff8f0}'
    + '#eg-btn-google:disabled{opacity:.6;cursor:wait}'
    + '#eg-modal-or{text-align:center;margin:14px 0;color:#aaa;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;font-family:"Roboto Condensed",sans-serif}'
    + '#eg-modal-form{display:flex;flex-direction:column;gap:10px;margin:0}'
    + '#eg-modal-email{width:100%;padding:12px 14px;border:1px solid #ddd;border-radius:6px;font-size:13px;font-family:inherit;outline:none;transition:border-color .15s;box-sizing:border-box;color:#0e0a06}'
    + '#eg-modal-email:focus{border-color:#bb1919}'
    + '#eg-btn-magic{width:100%;padding:12px 16px;background:#bb1919;color:#fff;border:none;font-size:13px;font-weight:600;border-radius:6px;cursor:pointer;font-family:inherit;transition:opacity .15s}'
    + '#eg-btn-magic:hover{opacity:.9}'
    + '#eg-btn-magic:disabled{opacity:.5;cursor:wait}'
    + '#eg-modal-status{font-size:12px;text-align:center;min-height:18px;margin-top:12px;font-family:inherit}'
    + '#eg-modal-status.is-success{color:#2e7d32}'
    + '#eg-modal-status.is-error{color:#bb1919}'
    + '#eg-modal-status.is-loading{color:#777}'
    + '#eg-modal-foot{font-size:10px;color:#999;text-align:center;margin-top:16px;line-height:1.5;font-family:inherit}'
    + '#eg-modal-foot a{color:inherit;text-decoration:underline}'
    + '@media (max-width:480px){#eg-modal-card{padding:26px 22px 20px;max-width:100%}}';
  var st = document.createElement('style');
  st.id = 'eg-modal-styles';
  st.textContent = css;
  document.head.appendChild(st);

  // ---- HTML (identical structure to homepage modal) ----
  var html = '<div id="eg-modal-backdrop" data-eg-close></div>'
    + '<div id="eg-modal-card">'
    + '<button id="eg-modal-close" type="button" data-eg-close aria-label="Close">×</button>'
    + '<div id="eg-modal-logo"><span class="e-red">E</span>gleze</div>'
    + '<h2 id="eg-modal-headline">Sign in to Egleze</h2>'
    + '<p id="eg-modal-sub">Save stories, react, and build a memory of what\'s shaping the world.</p>'
    + '<button id="eg-btn-google" type="button">'
    +   '<svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">'
    +     '<path d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.71v2.27h2.9c1.7-1.56 2.69-3.87 2.69-6.62z" fill="#4285f4"/>'
    +     '<path d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.27c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.97v2.34A9 9 0 0 0 9 18z" fill="#34a853"/>'
    +     '<path d="M3.95 10.69A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.69V4.97H.97A9 9 0 0 0 0 9c0 1.45.35 2.82.97 4.03l2.98-2.34z" fill="#fbbc04"/>'
    +     '<path d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .97 4.97l2.98 2.34C4.66 5.18 6.65 3.58 9 3.58z" fill="#ea4335"/>'
    +   '</svg>'
    +   'Continue with Google'
    + '</button>'
    + '<div id="eg-modal-or">or</div>'
    + '<form id="eg-modal-form" novalidate>'
    +   '<input type="email" id="eg-modal-email" placeholder="your@email.com" required autocomplete="email" />'
    +   '<button type="submit" id="eg-btn-magic">Send magic link</button>'
    + '</form>'
    + '<div id="eg-modal-status" role="status" aria-live="polite"></div>'
    + '<p id="eg-modal-foot">By continuing you agree to Egleze\'s<br><a href="/legal">Terms</a> and <a href="/legal">Privacy Policy</a>.</p>'
    + '</div>';
  var modal = document.createElement('div');
  modal.id = 'eg-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'eg-modal-headline');
  modal.innerHTML = html;
  // append to body (or queue if body not ready yet)
  function attach() {
    if (document.body) document.body.appendChild(modal);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(modal); });
  }
  attach();

  // ---- behavior ----
  function setStatus(text, kind) {
    var s = document.getElementById('eg-modal-status');
    if (!s) return;
    s.textContent = text || '';
    s.className = kind ? ('is-' + kind) : '';
  }

  function openModal() {
    var m = document.getElementById('eg-modal');
    if (!m) {
      // Modal wasn't attached yet (script ran before body). Attach now.
      if (document.body) {
        document.body.appendChild(modal);
        m = document.getElementById('eg-modal');
      }
      if (!m) {
        console.error('[egleze signin-modal] openSignIn called but modal could not be attached');
        return;
      }
    }
    m.classList.add('is-shown');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { m.classList.add('is-open'); });
    var emailEl = document.getElementById('eg-modal-email');
    if (emailEl) setTimeout(function () { try { emailEl.focus(); } catch (_) {} }, 120);
  }

  function closeModal() {
    var m = document.getElementById('eg-modal');
    if (!m) return;
    m.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      m.classList.remove('is-shown');
      setStatus('', '');
      var magic = document.getElementById('eg-btn-magic');
      var google = document.getElementById('eg-btn-google');
      if (magic) magic.disabled = false;
      if (google) google.disabled = false;
    }, 200);
  }

  // delegated handlers (the modal element is in the DOM by the time these fire)
  document.addEventListener('click', function (e) {
    if (e.target && e.target.matches && e.target.matches('[data-eg-close]')) {
      e.preventDefault();
      closeModal();
    }
  });

  // Google
  document.addEventListener('click', async function (e) {
    var btn = e.target && e.target.closest && e.target.closest('#eg-btn-google');
    if (!btn) return;
    e.preventDefault();
    if (!window.egleze || !window.egleze.auth) {
      setStatus('Sign-in not available right now.', 'error');
      return;
    }
    btn.disabled = true;
    setStatus('Opening Google…', 'loading');
    console.log('[egleze signin-modal] redirecting to:', window.location.href);
    try {
      await window.egleze.auth.signInWithGoogle(window.location.href);
    } catch (err) {
      console.error('[egleze signin-modal] google failed:', err);
      setStatus('Could not open Google sign-in. Please try again.', 'error');
      btn.disabled = false;
    }
  });

  // Magic link
  document.addEventListener('submit', async function (e) {
    var form = e.target;
    if (!form || form.id !== 'eg-modal-form') return;
    e.preventDefault();
    var emailEl = document.getElementById('eg-modal-email');
    var btn = document.getElementById('eg-btn-magic');
    var email = emailEl ? String(emailEl.value || '').trim() : '';
    if (!email || !/.+@.+\..+/.test(email)) {
      setStatus('Please enter a valid email.', 'error');
      return;
    }
    if (!window.egleze || !window.egleze.auth) {
      setStatus('Sign-in not available right now.', 'error');
      return;
    }
    if (btn) btn.disabled = true;
    setStatus('Sending magic link…', 'loading');
    console.log('[egleze signin-modal] magic link redirect to:', window.location.href);
    try {
      var res = await window.egleze.auth.signInWithMagicLink(email, window.location.href);
      if (res && res.error) {
        console.error('[egleze signin-modal] magic link error:', res.error);
        setStatus('Could not send the link. ' + (res.error.message || 'Please try again.'), 'error');
        if (btn) btn.disabled = false;
      } else {
        setStatus('Check your inbox — we sent you a sign-in link.', 'success');
      }
    } catch (err) {
      console.error('[egleze signin-modal] magic link failed:', err);
      setStatus('Could not send the link. Please try again.', 'error');
      if (btn) btn.disabled = false;
    }
  });

  // Auto-close on successful sign-in
  function wireAuthClose() {
    if (window.egleze && window.egleze.auth && window.egleze.auth.onChange) {
      window.egleze.auth.onChange(function (payload) {
        if (payload && payload.event === 'SIGNED_IN') {
          var m = document.getElementById('eg-modal');
          if (m && m.classList.contains('is-shown')) closeModal();
        }
      });
    } else {
      // auth not ready yet — retry
      setTimeout(wireAuthClose, 200);
    }
  }
  wireAuthClose();

  // public API
  window.egleze = window.egleze || {};
  window.egleze.ui = window.egleze.ui || {};
  window.egleze.ui.openSignIn = openModal;
  window.egleze.ui.closeSignIn = closeModal;
})();
