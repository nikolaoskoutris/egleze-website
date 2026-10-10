const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
function harness(kind, passwordResult) {
  const nodes = new Map();
  const documentEvents = new Map();
  const calls = [];
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.hidden = false; this.disabled = false;
      this.value = ''; this.style = {}; this.listeners = new Map(); this.attrs = {};
      const classes = new Set();
      this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) };
    }
    set id(value) { this._id = value; nodes.set(value, this); }
    get id() { return this._id; }
    set innerHTML(value) { this.html = value; parse(value); }
    setAttribute(k, v) { this.attrs[k] = v; }
    appendChild() {}
    addEventListener(type, fn) { const list = this.listeners.get(type) || []; list.push(fn); this.listeners.set(type, list); }
    closest(selector) { return selector === '#' + this.id ? this : null; }
    matches() { return false; }
    focus() { this.focused = true; }
  }
  function parse(html) {
    for (const m of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
      const el = new Element(m[1]); el.id = m[3]; el.hidden = /\bhidden\b/.test(m[2]);
    }
  }
  const document = {
    readyState: 'complete', body: new Element(), head: new Element(),
    getElementById: id => nodes.get(id) || null,
    createElement: tag => new Element(tag), querySelector: () => null, querySelectorAll: () => [],
    addEventListener(type, fn) { const list = documentEvents.get(type) || []; list.push(fn); documentEvents.set(type, list); },
  };
  const auth = {
    getUser: async () => null, onChange: () => {},
    signInWithPassword: async (...args) => { calls.push(['password', ...args]); return typeof passwordResult === 'function' ? passwordResult() : passwordResult || { data: { session: {} }, error: null }; },
    signInWithMagicLink: async (...args) => { calls.push(['magic', ...args]); return { error: null }; },
  };
  const context = { document, window: { egleze: { auth }, location: { href: 'capacitor://localhost' } }, console: { log() {}, warn() {}, error() {} }, requestAnimationFrame: fn => fn(), setTimeout: fn => fn() };
  if (kind === 'shared') {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/signin-modal.js'), 'utf8'), context);
  } else {
    const html = fs.readFileSync(path.join(root, 'account.html'), 'utf8');
    parse(html);
    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].find(m => m[1].includes('function renderAuthSlot'))[1];
    vm.runInNewContext(script, context);
  }
  async function emit(type, id) {
    const target = nodes.get(id);
    const event = { target, preventDefault() {}, stopPropagation() {} };
    for (const fn of target.listeners.get(type) || []) await fn(event);
    for (const fn of documentEvents.get(type) || []) await fn(event);
  }
  nodes.get('eg-modal-email').value = 'review@example.test';
  return { nodes, calls, emit };
}

for (const kind of ['shared', 'account']) {
  test(`${kind}: password mode signs in directly, sends no email and clears the password`, async () => {
    const h = harness(kind);
    assert.equal(h.nodes.get('eg-modal-password').hidden, true);
    await h.emit('click', 'eg-btn-password-mode');
    assert.equal(h.nodes.get('eg-modal-password').hidden, false);
    h.nodes.get('eg-modal-password').value = ' test-password ';
    await h.emit('submit', 'eg-modal-form');
    assert.deepEqual(h.calls, [['password', 'review@example.test', ' test-password ']]);
    assert.equal(h.nodes.get('eg-modal-password').value, '');
    assert.equal(h.nodes.get('eg-btn-magic').disabled, false);
  });
  test(`${kind}: invalid or unavailable password login stays open, allows retry and never sends a magic link`, async () => {
    for (const result of [{ error: { message: 'Invalid login credentials' } }, () => { throw new Error('offline'); }]) {
      const h = harness(kind, result);
      await h.emit('click', 'eg-btn-password-mode');
      await h.emit('submit', 'eg-modal-form');
      assert.equal(h.calls.length, 0);
      h.nodes.get('eg-modal-password').value = 'wrong';
      await h.emit('submit', 'eg-modal-form');
      assert.equal(h.calls.length, 1);
      assert.equal(h.calls[0][0], 'password');
      assert.match(h.nodes.get('eg-modal-status').textContent, /Could not sign in/);
      assert.equal(h.nodes.get('eg-modal-password').hidden, false);
      assert.equal(h.nodes.get('eg-btn-magic').disabled, false);
      assert.equal(h.nodes.get('eg-btn-password-mode').disabled, false);
    }
  });
  test(`${kind}: switching back preserves magic-link login and clears password`, async () => {
    const h = harness(kind);
    await h.emit('click', 'eg-btn-password-mode');
    h.nodes.get('eg-modal-password').value = 'discard-me';
    await h.emit('click', 'eg-btn-password-mode');
    assert.equal(h.nodes.get('eg-modal-password').value, '');
    await h.emit('submit', 'eg-modal-form');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0][0], 'magic');
  });
  test(`${kind}: repeated submit while a password request is pending sends only once`, async () => {
    let resolve;
    const waiting = new Promise(r => { resolve = r; });
    const h = harness(kind, () => waiting);
    await h.emit('click', 'eg-btn-password-mode');
    h.nodes.get('eg-modal-password').value = 'pending';
    const first = h.emit('submit', 'eg-modal-form');
    await h.emit('submit', 'eg-modal-form');
    assert.equal(h.calls.length, 1);
    resolve({ error: { message: 'invalid' } });
    await first;
  });
}

test('auth password API normalizes only email and passes the unchanged password to Supabase', async () => {
  const calls = [];
  const window = { supabase: { createClient: () => ({ auth: { signInWithPassword: async input => { calls.push(input); return { error: null }; } } }) } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8'), { window, console, document: { readyState: 'complete', querySelector: () => null } });
  await window.egleze.auth.signInWithPassword(' REVIEW@EXAMPLE.TEST ', ' leading-and-trailing ');
  assert.equal(calls[0].email, 'review@example.test');
  assert.equal(calls[0].password, ' leading-and-trailing ');
});
