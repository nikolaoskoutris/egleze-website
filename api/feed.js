// JSON Feed for machine-readable discovery of Egleze's latest public stories.

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3I2jAyKsQyMLvxuQG47rBw_UW_QSZLs';
const SITE_URL = 'https://egleze.com';

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
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function storyUrl(story) {
  return `${SITE_URL}/story/${story.id}-${slugify(story.headline)}`;
}

function renderItem(story) {
  const published = validDate(story.approved_at);
  if (!published || !story.source_url) return null;
  const canonicalUrl = storyUrl(story);
  const tags = [story.topic, story.show_name].filter(Boolean);
  const item = {
    id: canonicalUrl,
    url: canonicalUrl,
    external_url: story.source_url,
    title: story.headline,
    summary: story.summary || story.headline,
    date_published: published,
    authors: [{ name: 'Egleze Editorial Desk', url: `${SITE_URL}/legal.html#standards` }]
  };
  const modified = validDate(story.updated_at);
  if (modified && modified > published) item.date_modified = modified;
  if (tags.length) item.tags = tags;
  item._egleze = {
    source_url: story.source_url,
    show_name: story.show_name || undefined,
    topic: story.topic || undefined,
    attribution_status: story.attribution_status || undefined
  };
  return item;
}

async function fetchStories() {
  const path = [
    'stories?select=id,headline,summary,show_name,topic,approved_at,updated_at,source_url,attribution_status',
    'status=eq.approved',
    'approved_at=not.is.null',
    'source_url=not.is.null',
    'attribution_status=in.(verified,corrected)',
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

function renderFeed(stories) {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: 'Egleze — Latest Podcast Intelligence',
    home_page_url: `${SITE_URL}/`,
    feed_url: `${SITE_URL}/feed.json`,
    description: 'Latest source-linked podcast moments published by the Egleze Editorial Desk.',
    language: 'en-IE',
    authors: [{ name: 'Egleze Editorial Desk', url: `${SITE_URL}/legal.html#standards` }],
    items: stories.map(renderItem).filter(Boolean)
  };
}

module.exports = async function handler(req, res) {
  try {
    const stories = await fetchStories();
    res.setHeader('Content-Type', 'application/feed+json; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json(renderFeed(stories));
  } catch (error) {
    console.error('[feed]', error.message || error);
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ error: 'Feed temporarily unavailable' });
  }
};

module.exports._test = { fetchStories, renderFeed, renderItem, slugify, storyUrl, validDate };
