const test = require('node:test');
const assert = require('node:assert/strict');

const indexnowModule = require('../api/indexnow');
const indexnow = indexnowModule._test;

test('IndexNow uses the canonical full story slug', () => {
  assert.equal(
    indexnow.slugify('Host says AI’s “hard problem” is real'),
    'host-says-ais-hard-problem-is-real'
  );
});

test('IndexNow verifies an approved story before submitting its canonical URL', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options: options || {} });
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 42, headline: 'Signal & Context' }]
      };
    }
    return { ok: true, status: 200 };
  };

  const story = await indexnow.fetchApprovedStory(42);
  const canonical = 'https://egleze.com/story/' + story.id + '-' + indexnow.slugify(story.headline);
  const result = await indexnow.submitIndexNow(canonical, 3);

  assert.equal(result.ok, true);
  assert.match(decodeURIComponent(calls[0].url), /status=eq\.approved/);
  const submitted = JSON.parse(calls[1].options.body);
  assert.deepEqual(submitted.urlList, ['https://egleze.com/story/42-signal-context']);
  assert.equal(submitted.host, 'egleze.com');
  assert.match(submitted.keyLocation, /^https:\/\/egleze\.com\//);
});

test('IndexNow retries bounded upstream failures and reports the final status', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });

  let attempts = 0;
  global.fetch = async () => {
    attempts += 1;
    return { ok: attempts === 3, status: attempts === 3 ? 200 : 503 };
  };

  const result = await indexnow.submitIndexNow('https://egleze.com/story/1-test', 3);
  assert.equal(attempts, 3);
  assert.deepEqual(result, { ok: true, status: 200, attempts: 3 });
});
