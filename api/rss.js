// Standards-compliant recent-story RSS feed for search and publisher discovery.

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3I2jAyKsQyMLvxuQG47rBw_UW_QSZLs';
const SITE_URL = 'https://egleze.com';

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function validDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function storyUrl(story) {
  return `${SITE_URL}/story/${story.id}-${slugify(story.headline)}`;
}

function renderItem(story) {
  const published = validDate(story.approved_at);
  if (!published) return '';
  const updated = validDate(story.updated_at);
  const url = storyUrl(story);
  const sourceTitle = story.show_name || 'Original source';
  const category = story.topic ? `\n      <category>${xmlEscape(story.topic)}</category>` : '';
  const sourceValue = story.source_url
    ? `${sourceTitle} — ${story.source_url}`
    : sourceTitle;
  const source = `\n      <dc:source>${xmlEscape(sourceValue)}</dc:source>`;
  const modified = updated && updated.getTime() > published.getTime()
    ? `\n      <dcterms:modified>${updated.toISOString()}</dcterms:modified>`
    : '';

  return `    <item>
      <title>${xmlEscape(story.headline)}</title>
      <link>${xmlEscape(url)}</link>
      <guid isPermaLink="true">${xmlEscape(url)}</guid>
      <description>${xmlEscape(story.summary || story.headline)}</description>
      <pubDate>${published.toUTCString()}</pubDate>${modified}
      <dc:creator>Egleze Editorial Desk</dc:creator>${category}${source}
    </item>`;
}

async function fetchStories() {
  const path = [
    'stories?select=id,headline,summary,show_name,topic,approved_at,updated_at,source_url',
    'status=eq.approved',
    'approved_at=not.is.null',
    'order=approved_at.desc',
    'limit=100'
  ].join('&');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Accept: 'application/json',
      'Accept-Profile': 'public'
    }
  });
  if (!response.ok) throw new Error(`Supabase returned HTTP ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

function renderFeed(stories, generatedAt = new Date()) {
  const items = stories.map(renderItem).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:atom="http://www.w3.org/2005/Atom"
     xmlns:dc="http://purl.org/dc/elements/1.1/"
     xmlns:dcterms="http://purl.org/dc/terms/">
  <channel>
    <title>Egleze — Latest Podcast Intelligence</title>
    <link>${SITE_URL}/</link>
    <description>The latest source-linked moments surfaced by the Egleze Editorial Desk.</description>
    <language>en-ie</language>
    <lastBuildDate>${generatedAt.toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

module.exports = async function handler(req, res) {
  try {
    const stories = await fetchStories();
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).send(renderFeed(stories));
  } catch (error) {
    console.error('[rss]', error.message || error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Feed temporarily unavailable');
  }
};

module.exports._test = { renderFeed, renderItem, slugify, storyUrl, validDate };
