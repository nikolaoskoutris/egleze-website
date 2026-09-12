const test = require('node:test');
const assert = require('node:assert/strict');

const sitemap = require('../api/sitemap')._test;
const rss = require('../api/rss')._test;

test('sitemap index exposes every segmented public endpoint', () => {
  const xml = sitemap.sitemapIndex();
  [
    '/sitemap-static.xml',
    '/sitemap-stories.xml',
    '/sitemap-episodes.xml',
    '/sitemap-shows.xml',
    '/sitemap-topics.xml',
    '/news-sitemap.xml'
  ].forEach(path => assert.match(xml, new RegExp(path.replace('.', '\\.'))));
});

test('static sitemap never invents a regeneration-date lastmod', async () => {
  const result = await sitemap.buildSitemap('static');
  assert.equal(result.errors.length, 0);
  assert.equal(result.urls.length, 7);
  assert.ok(result.urls.every(url => !url.includes('<lastmod>')));
});

test('episode sitemap omits unknown publication dates instead of using update time', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { id: 1, title: 'Unknown date', published_at: null },
      { id: 2, title: 'Known date', published_at: '2026-09-10T09:30:00Z' }
    ]
  });

  const result = await sitemap.buildSitemap('episodes');
  assert.equal(result.errors.length, 0);
  assert.doesNotMatch(result.urls[0], /<lastmod>/);
  assert.match(result.urls[1], /<lastmod>2026-09-10<\/lastmod>/);
});

test('news sitemap query uses a strict rolling 48-hour approval boundary', async t => {
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  let requestedUrl = '';
  global.fetch = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => [{
        id: 42,
        headline: 'A & B',
        approved_at: '2026-09-11T12:00:00Z'
      }]
    };
  };

  const now = new Date('2026-09-12T12:00:00Z');
  const result = await sitemap.buildSitemap('news', now);
  assert.match(decodeURIComponent(requestedUrl), /approved_at=gte\.2026-09-10T12:00:00\.000Z/);
  assert.match(result.urls[0], /<news:publication_date>2026-09-11T12:00:00\.000Z<\/news:publication_date>/);
  assert.match(result.urls[0], /<news:title>A &amp; B<\/news:title>/);
});

test('RSS uses approval time, canonical URLs and truthful source metadata', () => {
  const feed = rss.renderFeed([
    {
      id: 7,
      headline: 'Signal & context',
      summary: 'A concise summary.',
      show_name: 'Source Show',
      topic: 'AI & Tech',
      approved_at: '2026-09-12T08:00:00Z',
      updated_at: '2026-09-12T08:30:00Z',
      source_url: 'https://example.com/watch?a=1&b=2'
    },
    { id: 8, headline: 'No public date', approved_at: null }
  ], new Date('2026-09-12T09:00:00Z'));

  assert.match(feed, /https:\/\/egleze\.com\/story\/7-signal-context/);
  assert.match(feed, /<pubDate>Sat, 12 Sep 2026 08:00:00 GMT<\/pubDate>/);
  assert.match(feed, /<dc:creator>Egleze Editorial Desk<\/dc:creator>/);
  assert.match(feed, /<dc:source>Source Show — https:\/\/example\.com\/watch\?a=1&amp;b=2<\/dc:source>/);
  assert.doesNotMatch(feed, /No public date/);
});
