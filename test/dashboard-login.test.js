const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

test('signed-out dashboard focuses the existing email field safely', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'dashboard.html'), 'utf8');

  assert.match(html, /id="login-email"/);
  assert.match(html, /getElementById\('login-email'\)\?\.focus\(\)/);
  assert.doesNotMatch(html, /getElementById\('login-input'\)\.focus\(\)/);
});
