// Shared by the website Account page and the native profile menu.
(function () {
  window.egleze = window.egleze || {};
  window.egleze.ui = window.egleze.ui || {};
  let dialog, pending = false, finished = false, previousFocus;
  const el = id => document.getElementById('eg-delete-' + id);
  function close() {
    if (pending) return;
    dialog.close();
    if (finished) window.location.reload();
    else if (previousFocus) previousFocus.focus();
  }
  function mount() {
    if (dialog) return;
    const style = document.createElement('style');
    style.textContent = '#eg-delete-dialog{box-sizing:border-box;width:calc(100% - 32px);max-width:420px;max-height:calc(100dvh - 48px);overflow:auto;border:0;padding:26px;background:#fff;color:#1c1917;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border-radius:12px}#eg-delete-dialog::backdrop{background:rgba(0,0,0,.6)}#eg-delete-dialog h2{font-size:23px;line-height:1.2;margin:0 0 14px}#eg-delete-dialog input{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #888;border-radius:6px;margin:8px 0}#eg-delete-dialog button{min-height:44px;padding:10px 15px;font:inherit;border:1px solid #aaa;border-radius:6px;background:white;color:#222}#eg-delete-dialog button:disabled{opacity:.5}#eg-delete-confirm{background:#a32620!important;color:white!important;border-color:#a32620!important}#eg-delete-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:18px}#eg-delete-error{color:#a32620}#eg-delete-dialog a{color:#a32620}';
    document.head.appendChild(style);
    dialog = document.createElement('dialog');
    dialog.id = 'eg-delete-dialog';
    dialog.setAttribute('aria-labelledby', 'eg-delete-title');
    dialog.innerHTML = '<h2 id="eg-delete-title">Delete your account?</h2>' +
      '<p id="eg-delete-description">This permanently deletes your Egleze login, profile, saved stories, follows, notification preferences and linked activity. You cannot undo this.</p>' +
      '<div id="eg-delete-form"><label for="eg-delete-input">Type DELETE to confirm</label><input id="eg-delete-input" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>' +
      '<p id="eg-delete-error" role="alert"></p>' +
      '<p id="eg-delete-status" role="status" aria-live="polite"></p>' +
      '<p id="eg-delete-apple" hidden>Your Egleze account is deleted. To also remove its older Apple connection, open iPhone Settings → your name → Sign in with Apple → Egleze → Delete. <a href="https://support.apple.com/102571" target="_blank" rel="noopener">Apple instructions</a></p>' +
      '<div id="eg-delete-actions"><button id="eg-delete-cancel" type="button">Cancel</button><button id="eg-delete-confirm" type="button" disabled>Delete forever</button></div>';
    document.body.appendChild(dialog);
    el('input').addEventListener('input', () => { el('confirm').disabled = pending || el('input').value.trim().toUpperCase() !== 'DELETE'; });
    el('cancel').addEventListener('click', close);
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    el('confirm').addEventListener('click', async () => {
      if (pending || finished || el('input').value.trim().toUpperCase() !== 'DELETE') return;
      pending = true;
      el('confirm').disabled = el('cancel').disabled = el('input').disabled = true;
      el('error').textContent = '';
      el('status').textContent = 'Deleting your account…';
      try {
        const result = await window.egleze.auth.deleteAccount('DELETE');
        finished = true;
        el('title').textContent = 'Account deleted';
        el('description').textContent = 'Your Egleze account and linked account data have been deleted. You can still browse stories without signing in.';
        el('form').hidden = el('confirm').hidden = true;
        el('apple').hidden = result.apple_access !== 'manual_revocation_required';
        el('status').textContent = '';
        el('cancel').textContent = 'Continue browsing';
      } catch (error) {
        el('status').textContent = '';
        el('error').textContent = error.message || 'Deletion was not confirmed. Please try again.';
      } finally {
        pending = false;
        el('cancel').disabled = el('input').disabled = false;
        el('confirm').disabled = finished || el('input').value.trim().toUpperCase() !== 'DELETE';
      }
    });
  }
  window.egleze.ui.openDeleteAccount = function () {
    mount();
    if (dialog.open) return;
    previousFocus = document.activeElement;
    if (!finished) {
      el('input').value = '';
      el('confirm').disabled = true;
      el('error').textContent = '';
    }
    dialog.showModal();
    (finished ? el('cancel') : el('input')).focus();
  };
})();
