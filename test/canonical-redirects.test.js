const test = require('node:test');
const assert = require('node:assert/strict');

const storyHandler = require('../api/story');
const episodeHandler = require('../api/episode');
const story = storyHandler._test;
const episode = episodeHandler._test;

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
}

test('story canonical slug preserves the complete current headline', () => {
  assert.equal(
    story.canonicalStorySlug({ id: 891, headline: 'Filmmaker claims bank demanded company shutdown' }),
    '891-filmmaker-claims-bank-demanded-company-shutdown'
  );
});

test('episode canonical slug preserves the complete current title', () => {
  assert.equal(
    episode.canonicalEpisodeSlug({ id: 42, title: 'A source-linked episode: full context' }),
    '42-a-source-linked-episode-full-context'
  );
});

test('obsolete story slugs receive a permanent redirect before page rendering', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ id: 891, headline: 'Current complete headline', status: 'approved' }]
  });
  const res = responseRecorder();

  await storyHandler({ query: { slug: '891-old-truncated-headline' } }, res);

  assert.equal(res.statusCode, 308);
  assert.equal(res.headers.Location, '/story/891-current-complete-headline');
  assert.equal(res.body, 'Permanent Redirect');
});

test('obsolete episode slugs receive a permanent redirect before moment lookup', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => [{ id: 42, title: 'Current complete title', status: 'published' }]
  });
  const res = responseRecorder();

  await episodeHandler({ query: { slug: '42-old-title' } }, res);

  assert.equal(res.statusCode, 308);
  assert.equal(res.headers.Location, '/episodes/42-current-complete-title');
  assert.equal(res.body, 'Permanent Redirect');
});
