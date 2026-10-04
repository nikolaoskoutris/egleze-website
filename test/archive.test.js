const test = require('node:test');
const assert = require('node:assert/strict');

const archive = require('../api/archive')._test;

test('archive renders ordinary crawlable canonical story links', () => {
  const html = archive.renderArchive([{
    id: 42,
    headline: 'Signal & Context',
    show_name: 'Source Show',
    topic: 'AI & Tech',
    approved_at: '2026-10-01T10:00:00Z'
  }], 1, 5960);

  assert.match(html, /href="\/story\/42-signal-context"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/egleze\.com\/archive">/);
  assert.match(html, /href="\/archive\?page=2"/);
  assert.match(html, /Page 1 of 60/);
});

test('archive pagination exposes deterministic previous and next links', () => {
  const html = archive.renderArchive([], 3, 5960);
  assert.match(html, /rel="prev" href="https:\/\/egleze\.com\/archive\?page=2"/);
  assert.match(html, /rel="next" href="https:\/\/egleze\.com\/archive\?page=4"/);
  assert.match(html, /href="\/archive\?page=2">← Newer stories/);
  assert.match(html, /href="\/archive\?page=4">Older stories →/);
});

test('archive escapes story content and preserves full canonical slugs', () => {
  const html = archive.renderArchive([{
    id: 7,
    headline: 'Host says “A & B” < C',
    show_name: 'Show',
    topic: 'Science'
  }], 1, 1);
  assert.match(html, /\/story\/7-host-says-a-b-c/);
  assert.match(html, /Host says “A &amp; B” &lt; C/);
  assert.doesNotMatch(html, /< C/);
});
