const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const source = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
function authHarness(result) {
  const calls = [], storage = new Map([['egleze.native.history.v1.person', 'history'], ['egleze_pending_save', '1']]);
  let listener;
  const user = { id: 'person', identities: [{ provider: 'apple' }] };
  const client = {
    auth: {
      getUser: async () => ({ data: { user } }),
      onAuthStateChange: fn => { listener = fn; },
      signOut: async options => { calls.push(['signOut', options]); return {}; },
    },
    functions: { invoke: async (name, options) => { calls.push([name, options]); return result; } },
  };
  const window = { supabase: { createClient: () => client } };
  const localStorage = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  const context = { window, console, localStorage, sessionStorage: localStorage, setTimeout, document: { readyState: 'complete', querySelector: () => null } };
  vm.runInNewContext(source('auth.js'), context);
  return { auth: window.egleze.auth, calls, storage, user, listener: (...args) => listener(...args) };
}
test('client failure preserves local account data and never treats sign-out as deletion', async () => {
  for (const result of [{ data: { deleted: false } }, { error: new Error('network') }, { error: { context: { json: async () => ({ sign_in_again: true }) } } }]) {
    const h = authHarness(result); await assert.rejects(h.auth.deleteAccount('DELETE'), /not confirmed/);
    assert.equal(h.storage.get('egleze.native.history.v1.person'), 'history');
    assert.equal(h.calls.some(x => x[0] === 'signOut'), false);
  }
});
test('client requires confirmation and only clears data after confirmed deletion', async () => {
  const h = authHarness({ data: { deleted: true, apple_access: 'not_applicable' } });
  await assert.rejects(h.auth.deleteAccount(''), /confirm/); assert.equal(h.calls.length, 0);
  const result = await h.auth.deleteAccount('DELETE'); assert.equal(result.deleted, true);
  assert.equal(h.storage.has('egleze.native.history.v1.person'), false);
  assert.equal(h.storage.has('egleze_pending_save'), false);
  assert.equal(h.calls[0][1].body.action, 'delete'); assert.equal(h.calls[0][1].body.user_id, undefined);
  assert.equal(h.calls.at(-1)[1].scope, 'local');
});
test('only a pending Apple flow sends provider credentials; failure retains the retry marker', async () => {
  const h = authHarness({ data: { stored: true } });
  const session = { user: h.user, provider_refresh_token: 'apple-token' };
  await h.auth.storeAppleCredential(session); assert.equal(h.calls.length, 0);
  h.auth.markOAuthProvider('google'); await h.auth.storeAppleCredential(session); assert.equal(h.calls.length, 0);
  h.auth.markOAuthProvider('apple'); await h.auth.storeAppleCredential(session);
  assert.equal(h.calls[0][1].body.refresh_token, 'apple-token'); assert.equal(h.storage.has('egleze.oauth.provider'), false);
  const failed = authHarness({ error: {} }); failed.auth.markOAuthProvider('apple');
  await assert.rejects(failed.auth.storeAppleCredential(session)); assert.equal(failed.storage.get('egleze.oauth.provider'), 'apple');
});
function modalHarness(deleteAccount) {
  const nodes = new Map(); let reloaded = false;
  class Element {
    constructor() { this.listeners = new Map(); this.hidden = false; this.disabled = false; this.value = ''; }
    set id(v) { this._id = v; nodes.set(v, this); }
    get id() { return this._id; }
    set innerHTML(value) {
      for (const match of value.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const child = new Element(); child.id = match[2]; child.hidden = /\bhidden\b/.test(match[1]); child.disabled = /\bdisabled\b/.test(match[1]);
      }
    }
    setAttribute() {} appendChild() {} focus() { this.focused = true; }
    addEventListener(type, fn) { this.listeners.set(type, fn); }
    showModal() { this.open = true; } close() { this.open = false; }
  }
  const document = { createElement: () => new Element(), getElementById: id => nodes.get(id), head: new Element(), body: new Element(), activeElement: new Element() };
  const window = { egleze: { auth: { deleteAccount } }, location: { reload: () => { reloaded = true; } } };
  vm.runInNewContext(source('account-delete.js'), { window, document });
  window.egleze.ui.openDeleteAccount();
  return { get: id => nodes.get('eg-delete-' + id), emit: (id, type) => nodes.get('eg-delete-' + id).listeners.get(type)?.({ preventDefault() {} }), reloaded: () => reloaded };
}
test('deletion dialog rejects accidental and repeated submits; cannot close while deleting', async () => {
  let resolve, count = 0; const waiting = new Promise(r => { resolve = r; });
  const h = modalHarness(() => { count++; return waiting; });
  await h.emit('confirm', 'click'); assert.equal(count, 0);
  h.get('input').value = 'DELETE'; h.emit('input', 'input'); const pending = h.emit('confirm', 'click');
  await h.emit('confirm', 'click'); h.emit('dialog', 'cancel');
  assert.equal(count, 1); assert.equal(h.get('dialog').open, true);
  resolve({ deleted: true }); await pending;
  assert.equal(h.get('title').textContent, 'Account deleted'); assert.equal(h.get('form').hidden, true);
  h.emit('cancel', 'click'); assert.equal(h.reloaded(), true);
});
test('failed deletion remains visible, permits retry and never shows success', async () => {
  const h = modalHarness(async () => { throw new Error('Deletion was not confirmed. Please try again.'); });
  h.get('input').value = 'DELETE'; await h.emit('confirm', 'click');
  assert.match(h.get('error').textContent, /not confirmed/); assert.notEqual(h.get('title').textContent, 'Account deleted');
  assert.equal(h.get('confirm').disabled, false); assert.equal(h.get('form').hidden, false); assert.equal(h.reloaded(), false);
});
test('legacy Apple deletion success includes manual Apple revocation guidance', async () => {
  const h = modalHarness(async () => ({ deleted: true, apple_access: 'manual_revocation_required' }));
  h.get('input').value = 'DELETE'; await h.emit('confirm', 'click');
  assert.equal(h.get('apple').hidden, false); assert.equal(h.get('cancel').disabled, false);
});
