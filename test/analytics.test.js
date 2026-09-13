const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAnalyticsRow,
  classifyDevice,
  cleanHostname,
  cleanPath,
  isAutomatedRequest,
  isSameOriginBrowserRequest,
} = require('../lib/analytics.js');

function request(headers) {
  return { headers: Object.assign({ host: 'egleze.com' }, headers || {}) };
}

test('paths and referrers are minimised before storage', () => {
  assert.equal(cleanPath('/story/42-example?email=private@example.com#part'), '/story/42-example');
  assert.equal(cleanHostname('https://chatgpt.com/share/secret?x=1'), 'chatgpt.com');
  assert.equal(cleanHostname('not a valid host !'), null);
});

test('only coarse device categories are produced', () => {
  assert.equal(classifyDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)'), 'mobile');
  assert.equal(classifyDevice('Mozilla/5.0 (iPad; CPU OS 18_0)'), 'tablet');
  assert.equal(classifyDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)'), 'desktop');
});

test('session identifiers are accepted only after consent', () => {
  const session = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
  const base = {
    event_name: 'page_view',
    path: '/story/42-example?utm_source=test',
    content_kind: 'story',
    content_id: 42,
    session_id: session,
  };
  const rejected = buildAnalyticsRow(request({ 'user-agent': 'Mozilla/5.0' }), { ...base, consent_state: 'rejected' });
  const accepted = buildAnalyticsRow(request({ 'user-agent': 'Mozilla/5.0' }), { ...base, consent_state: 'accepted' });
  assert.equal(rejected.session_id, null);
  assert.equal(accepted.session_id, session);
  assert.equal(accepted.path, '/story/42-example');
  assert.equal(accepted.content_id, 42);
});

test('event and property allowlists discard arbitrary data', () => {
  assert.equal(buildAnalyticsRow(request(), { event_name: 'password_entered', path: '/' }), null);
  const row = buildAnalyticsRow(request(), {
    event_name: 'share_completed',
    path: '/',
    properties: { method: 'copy_link', email: 'private@example.com', payload: 'secret' },
  });
  assert.deepEqual(row.properties, { method: 'copy_link' });
});

test('same-origin validation and bot filtering reject noise', () => {
  assert.equal(isSameOriginBrowserRequest(request({ referer: 'https://egleze.com/story/42', 'sec-fetch-site': 'same-origin' })), true);
  assert.equal(isSameOriginBrowserRequest(request({ origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })), false);
  assert.equal(isAutomatedRequest(request({ 'user-agent': 'Googlebot/2.1' })), true);
  assert.equal(isAutomatedRequest(request({ 'user-agent': 'Mozilla/5.0', purpose: 'prefetch' })), true);
  assert.equal(isAutomatedRequest(request({ 'user-agent': 'Mozilla/5.0' })), false);
});

test('ingestion uses the managed Edge Function rather than a Vercel service-role secret', () => {
  const source = require('node:fs').readFileSync(require.resolve('../lib/analytics.js'), 'utf8');
  assert.match(source, /functions\/v1\/egleze-pulse/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
});
