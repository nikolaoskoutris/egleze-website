// Segmented sitemap and Google News sitemap generator for Egleze.

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3I2jAyKsQyMLvxuQG47rBw_UW_QSZLs';
const SITE_URL = 'https://egleze.com';

const TOPICS = [
  'ai-tech', 'combat-ufc', 'comedy', 'consciousness-medicine',
  'controversial', 'crime-justice', 'debates', 'education-learning',
  'energy-climate', 'entertainment', 'espionage', 'faith-spirituality',
  'geopolitics', 'health-longevity-biohacking', 'history', 'media-journalism',
  'military', 'money', 'monologues', 'politics', 'psychology',
  'relationships-family', 'science', 'society', 'sports', 'ufo-paranormal'
];

const SITEMAP_TYPES = ['static', 'stories', 'episodes', 'shows', 'topics', 'news'];

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
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function formatTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function urlBlock(loc, options = {}) {
  const lines = ['  <url>', `    <loc>${xmlEscape(loc)}</loc>`];
  if (options.lastmod) lines.push(`    <lastmod>${xmlEscape(options.lastmod)}</lastmod>`);
  if (options.changefreq) lines.push(`    <changefreq>${xmlEscape(options.changefreq)}</changefreq>`);
  if (options.priority) lines.push(`    <priority>${xmlEscape(options.priority)}</priority>`);
  lines.push('  </url>');
  return lines.join('\n');
}

function newsUrlBlock(story) {
  const loc = `${SITE_URL}/story/${story.id}-${slugify(story.headline)}`;
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>Egleze</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${xmlEscape(formatTimestamp(story.approved_at))}</news:publication_date>
      <news:title>${xmlEscape(story.headline)}</news:title>
    </news:news>
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

function sitemapIndex() {
  const entries = SITEMAP_TYPES.map(type => `  <sitemap>
    <loc>${SITE_URL}/${type === 'news' ? 'news-sitemap' : `sitemap-${type}`}.xml</loc>
  </sitemap>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
}

function standardUrlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

function newsUrlset(urls) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls.join('\n')}
</urlset>
`;
}

async function buildSitemap(type, now = new Date()) {
  const urls = [];
  const errors = [];

  if (type === 'static') {
    [
      ['/', 'daily', '1.0'],
      ['/shows.html', 'daily', '0.8'],
      ['/shorts.html', 'daily', '0.7'],
      ['/about', 'monthly', '0.5'],
      ['/for-podcasters.html', 'monthly', '0.5'],
      ['/subscribe', 'monthly', '0.5'],
      ['/legal.html', 'monthly', '0.3']
    ].forEach(([path, changefreq, priority]) => {
      urls.push(urlBlock(`${SITE_URL}${path}`, { changefreq, priority }));
    });
  }

  if (type === 'topics') {
    INDEXABLE_TOPICS.forEach(topic => {
      urls.push(urlBlock(`${SITE_URL}/topic/${topic}`, { changefreq: 'daily', priority: '0.6' }));
    });
  }

  if (type === 'shows') {
    const result = await supabaseFetch(
      'shows?select=slug,created_at&active=eq.true&slug=not.is.null&order=name.asc'
    );
    if (result.error) errors.push({ source: 'shows', error: result.error });
    result.data.forEach(show => {
      if (!show.slug) return;
      urls.push(urlBlock(`${SITE_URL}/shows/${show.slug}`, {
        lastmod: formatDate(show.created_at),
        changefreq: 'daily',
        priority: '0.7'
      }));
    });
  }

  if (type === 'episodes') {
    const result = await fetchAll(
      'episodes?select=id,title,published_at&status=eq.published&order=id.asc'
    );
    if (result.error) errors.push({ source: 'episodes', error: result.error });
    result.data.forEach(episode => {
      if (!episode.id || !episode.title) return;
      urls.push(urlBlock(`${SITE_URL}/episodes/${episode.id}-${slugify(episode.title)}`, {
        // Unknown source publication dates are intentionally omitted, never replaced by import/update time.
        lastmod: formatDate(episode.published_at),
        changefreq: 'weekly',
        priority: '0.7'
      }));
    });
  }

  if (type === 'stories') {
    const result = await fetchAll(
      'stories?select=id,headline,approved_at&status=eq.approved&order=id.asc'
    );
    if (result.error) errors.push({ source: 'stories', error: result.error });
    result.data.forEach(story => {
      if (!story.id || !story.headline) return;
      urls.push(urlBlock(`${SITE_URL}/story/${story.id}-${slugify(story.headline)}`, {
        // approved_at is the first known public-publish boundary; unknown legacy dates stay omitted.
        lastmod: formatDate(story.approved_at),
        changefreq: 'weekly',
        priority: '0.6'
      }));
    });
  }

  if (type === 'news') {
    const cutoff = new Date(now.getTime() - (48 * 60 * 60 * 1000)).toISOString();
    const result = await fetchAll(
      `stories?select=id,headline,approved_at&status=eq.approved&approved_at=gte.${encodeURIComponent(cutoff)}&approved_at=not.is.null&order=approved_at.desc`
    );
    if (result.error) errors.push({ source: 'news', error: result.error });
    result.data.forEach(story => {
      if (!story.id || !story.headline || !formatTimestamp(story.approved_at)) return;
      urls.push(newsUrlBlock(story));
    });
  }

  return { urls, errors };
}

module.exports = async function handler(req, res) {
  const type = String((req.query && req.query.type) || 'index').toLowerCase();
  const debug = req.query && req.query.debug === '1';

  if (type === 'index') {
    if (debug) {
      res.status(200).json({ type, sitemaps: SITEMAP_TYPES });
      return;
    }
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(sitemapIndex());
    return;
  }

  if (!SITEMAP_TYPES.includes(type)) {
    res.status(404).json({ error: 'Unknown sitemap type' });
    return;
  }

  const result = await buildSitemap(type);
  if (debug) {
    res.status(result.errors.length ? 503 : 200).json({
      type,
      url_count: result.urls.length,
      errors: result.errors
    });
    return;
  }

  if (result.errors.length) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).send('Sitemap temporarily unavailable');
    return;
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(type === 'news' ? newsUrlset(result.urls) : standardUrlset(result.urls));
};

module.exports._test = {
  buildSitemap,
  formatDate,
  formatTimestamp,
  newsUrlBlock,
  sitemapIndex,
  slugify,
  standardUrlset
};
