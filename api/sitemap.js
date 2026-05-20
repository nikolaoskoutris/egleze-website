// Dynamic sitemap generator for Egleze
// Lives at: api/sitemap.js
// Vercel rewrite: /sitemap.xml -> /api/sitemap
// Add ?debug=1 to URL for diagnostic JSON output instead of XML

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

const TOPICS = [
  'ai-tech', 'combat-ufc', 'comedy', 'consciousness-medicine',
  'controversial', 'crime-justice', 'debates', 'education-learning',
  'energy-climate', 'entertainment', 'espionage', 'faith-spirituality',
  'geopolitics', 'health-longevity-biohacking', 'history', 'media-journalism',
  'military', 'money', 'monologues', 'politics', 'psychology',
  'relationships-family', 'science', 'society', 'sports', 'ufo-paranormal'
];

// Only topics flagged hasStories=true in scripts/topic-data.json are
// indexable; their pages carry index,follow. The other ~14 carry noindex,
// so they must NOT appear in the sitemap (avoids 'Submitted URL marked
// noindex' in Search Console). Sourced from the SAME file the build uses
// so this can never drift from the deployed pages. Falls back to the full
// list if the file can't be loaded — the sitemap never breaks.
let INDEXABLE_TOPICS = TOPICS;
try {
  const topicData = require('../scripts/topic-data.json');
  if (topicData && Array.isArray(topicData.topics)) {
    const idx = topicData.topics
      .filter(t => t && t.hasStories && t.slug)
      .map(t => t.slug);
    if (idx.length > 0) INDEXABLE_TOPICS = idx;
  }
} catch (e) {
  // keep INDEXABLE_TOPICS = TOPICS (current behavior) — never break sitemap
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(d) {
  const dt = d ? new Date(d) : new Date();
  return dt.toISOString().slice(0, 10);
}

function urlBlock(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function supabaseFetch(path, label) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Profile': 'public',
        'Content-Profile': 'public'
      }
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: `HTTP ${res.status}: ${text.slice(0, 200)}`, data: [] };
    }
    const data = await res.json();
    return { error: null, data: Array.isArray(data) ? data : [] };
  } catch (e) {
    return { error: e.message || String(e), data: [] };
  }
}

module.exports = async function handler(req, res) {
  const today = formatDate();
  const urls = [];
  const debug = req.query && req.query.debug === '1';
  const errors = [];

  urls.push(urlBlock('https://egleze.com/', today, 'hourly', '1.0'));
  urls.push(urlBlock('https://egleze.com/shows.html', today, 'daily', '0.8'));
  urls.push(urlBlock('https://egleze.com/shorts.html', today, 'hourly', '0.7'));
  urls.push(urlBlock('https://egleze.com/legal.html', today, 'monthly', '0.3'));

  for (const topic of INDEXABLE_TOPICS) {
    urls.push(urlBlock(`https://egleze.com/topic/${topic}`, today, 'daily', '0.6'));
  }

  const showsResult = await supabaseFetch(
    'shows?select=slug,created_at&active=eq.true&slug=not.is.null&order=name.asc',
    'shows'
  );
  if (showsResult.error) errors.push({ source: 'shows', error: showsResult.error });
  for (const show of showsResult.data) {
    if (!show.slug) continue;
    const lastmod = formatDate(show.created_at);
    urls.push(urlBlock(
      `https://egleze.com/shows/${show.slug}`,
      lastmod,
      'daily',
      '0.7'
    ));
  }

  const storiesResult = await supabaseFetch(
    'stories?select=id,headline,created_at&status=eq.approved&order=created_at.desc&limit=5000',
    'stories'
  );
  if (storiesResult.error) errors.push({ source: 'stories', error: storiesResult.error });
  for (const story of storiesResult.data) {
    if (!story.id || !story.headline) continue;
    const slug = `${story.id}-${slugify(story.headline)}`;
    const lastmod = formatDate(story.created_at);
    urls.push(urlBlock(
      `https://egleze.com/story/${slug}`,
      lastmod,
      'weekly',
      '0.6'
    ));
  }

  if (debug) {
    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      total_urls: urls.length,
      static_count: 4 + INDEXABLE_TOPICS.length,
      indexable_topics: INDEXABLE_TOPICS.length,
      all_topics: TOPICS.length,
      shows_count: showsResult.data.length,
      stories_count: storiesResult.data.length,
      errors: errors,
      first_show: showsResult.data[0] || null,
      first_story: storiesResult.data[0] || null
    });
    return;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
