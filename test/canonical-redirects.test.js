const test = require('node:test');
const assert = require('node:assert/strict');

const story = require('../api/story')._test;
const episode = require('../api/episode')._test;

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
