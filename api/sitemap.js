// Dynamic sitemap generator for Egleze.

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3I2jAyKsQyMLvxuQG47rBw_UW_QSZLs';

const TOPICS = [
  'ai-tech', 'combat-ufc', 'comedy', 'consciousness-medicine',
  'controversial', 'crime-justice', 'debates', 'education-learning',
  'energy-climate', 'entertainment', 'espionage', 'faith-spirituality',
  'geopolitics', 'health-longevity-biohacking', 'history', 'media-journalism',
  'military', 'money', 'monologues', 'politics', 'psychology',
  'relationships-family', 'science', 'society', 'sports', 'ufo-paranormal'
];

let INDEXABLE_TOPICS = TOPICS;
try {
  const topicData = require('../scripts/topic-data.json');
  const indexable = topicData && Array.isArray(topicData.topics)
    ? topicData.topics.filter(t => t && t.hasStories && t.slug).map(t => t.slug)
    : [];
  if (indexable.length) INDEXABLE_TOPICS = indexable;
} catch (_) {}

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

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value) {
  const parsed = value ? new Date(value) : new Date();
  return parsed.toISOString().slice(0, 10);
}

function urlBlock(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function supabaseFetch(path) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_KEY,
        Accept: 'application/json',
        'Accept-Profile': 'public'
      }
    });
    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${(await response.text()).slice(0, 160)}`, data: [] };
    }
    const data = await response.json();
    return { error: null, data: Array.isArray(data) ? data : [] };
  } catch (error) {
    return { error: error.message || String(error), data: [] };
  }
}

async function fetchAll(pathWithoutPagination) {
  const PAGE = 1000;
  const all = [];
  for (let offset = 0; ; offset += PAGE) {
    const separator = pathWithoutPagination.includes('?') ? '&' : '?';
    const result = await supabaseFetch(
      `${pathWithoutPagination}${separator}limit=${PAGE}&offset=${offset}`
    );
    if (result.error) return { error: result.error, data: all };
    all.push(...result.data);
    if (result.data.length < PAGE) break;
    if (offset > 500000) break;
  }
  return { error: null, data: all };
}

module.exports = async function handler(req, res) {
  const today = formatDate();
  const urls = [];
  const errors = [];
  const debug = req.query && req.query.debug === '1';

  urls.push(urlBlock('https://egleze.com/', today, 'hourly', '1.0'));
  urls.push(urlBlock('https://egleze.com/shows.html', today, 'daily', '0.8'));
  urls.push(urlBlock('https://egleze.com/shorts.html', today, 'hourly', '0.7'));
  urls.push(urlBlock('https://egleze.com/legal.html', today, 'monthly', '0.3'));

  for (const topic of INDEXABLE_TOPICS) {
    urls.push(urlBlock(`https://egleze.com/topic/${topic}`, today, 'daily', '0.6'));
  }

  const showsResult = await supabaseFetch(
    'shows?select=slug,created_at&active=eq.true&slug=not.is.null&order=name.asc'
  );
  if (showsResult.error) errors.push({ source: 'shows', error: showsResult.error });
  for (const show of showsResult.data) {
    if (!show.slug) continue;
    urls.push(urlBlock(
      `https://egleze.com/shows/${show.slug}`,
      formatDate(show.created_at),
      'daily',
      '0.7'
    ));
  }

  const episodesResult = await fetchAll(
    'episodes?select=id,title,updated_at,published_at&status=eq.published&order=id.asc'
  );
  if (episodesResult.error) errors.push({ source: 'episodes', error: episodesResult.error });
  for (const episode of episodesResult.data) {
    if (!episode.id || !episode.title) continue;
    urls.push(urlBlock(
      `https://egleze.com/episodes/${episode.id}-${slugify(episode.title)}`,
      formatDate(episode.updated_at || episode.published_at),
      'weekly',
      '0.7'
    ));
  }

  const storiesResult = await fetchAll(
    'stories?select=id,headline,created_at&status=eq.approved&order=id.asc'
  );
  if (storiesResult.error) errors.push({ source: 'stories', error: storiesResult.error });
  for (const story of storiesResult.data) {
    if (!story.id || !story.headline) continue;
    urls.push(urlBlock(
      `https://egleze.com/story/${story.id}-${slugify(story.headline)}`,
      formatDate(story.created_at),
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
      episodes_count: episodesResult.data.length,
      stories_count: storiesResult.data.length,
      errors,
      first_episode: episodesResult.data[0] || null,
      first_story: storiesResult.data[0] || null
    });
    return;
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`);
};
