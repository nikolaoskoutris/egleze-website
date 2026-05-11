// Dynamic sitemap generator for Egleze
// Lives at: /api/sitemap.js
// Vercel rewrite: /sitemap.xml -> /api/sitemap
// Generates sitemap on every request, always up-to-date with the DB

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

// All 26 canonical topic slugs
const TOPICS = [
  'ai-tech', 'combat-ufc', 'comedy', 'consciousness-medicine',
  'controversial', 'crime-justice', 'debates', 'education-learning',
  'energy-climate', 'entertainment', 'espionage', 'faith-spirituality',
  'geopolitics', 'health-longevity-biohacking', 'history', 'media-journalism',
  'military', 'money', 'monologues', 'politics', 'psychology',
  'relationships-family', 'science', 'society', 'sports', 'ufo-paranormal'
];

// Helper: build a URL-safe slug from a headline (matches /api/story slug logic)
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Helper: escape XML special characters in URLs
function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Helper: format date as YYYY-MM-DD
function formatDate(d) {
  const dt = d ? new Date(d) : new Date();
  return dt.toISOString().slice(0, 10);
}

// Helper: build a <url> XML block
function urlBlock(loc, lastmod, changefreq, priority) {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export default async function handler(req, res) {
  const today = formatDate();
  const urls = [];

  // 1. Core static pages
  urls.push(urlBlock('https://egleze.com/', today, 'hourly', '1.0'));
  urls.push(urlBlock('https://egleze.com/shows.html', today, 'daily', '0.8'));
  urls.push(urlBlock('https://egleze.com/shorts.html', today, 'hourly', '0.7'));
  urls.push(urlBlock('https://egleze.com/legal.html', today, 'monthly', '0.3'));

  // 2. All 26 topic pages
  for (const topic of TOPICS) {
    urls.push(urlBlock(`https://egleze.com/topic/${topic}`, today, 'daily', '0.6'));
  }

  // 3. All active shows — fetched from Supabase
  try {
    const showsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/shows?select=slug,updated_at&active=eq.true&slug=not.is.null`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    if (showsRes.ok) {
      const shows = await showsRes.json();
      for (const show of shows) {
        if (!show.slug) continue;
        const lastmod = formatDate(show.updated_at);
        urls.push(urlBlock(
          `https://egleze.com/shows/${show.slug}`,
          lastmod,
          'daily',
          '0.7'
        ));
      }
    }
  } catch (e) {
    console.error('[sitemap] shows fetch failed:', e);
  }

  // 4. All approved stories — fetched from Supabase
  // Note: limited to 5000 to stay under sitemap size limits (50K is hard max).
  // When approved stories exceed 5000, consider sitemap index pattern.
  try {
    const storiesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/stories?select=id,headline,created_at&status=eq.approved&order=created_at.desc&limit=5000`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );
    if (storiesRes.ok) {
      const stories = await storiesRes.json();
      for (const story of stories) {
        const slug = `${story.id}-${slugify(story.headline)}`;
        const lastmod = formatDate(story.created_at);
        urls.push(urlBlock(
          `https://egleze.com/story/${slug}`,
          lastmod,
          'weekly',
          '0.6'
        ));
      }
    }
  } catch (e) {
    console.error('[sitemap] stories fetch failed:', e);
  }

  // Build final XML
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

  // Cache for 1 hour at the CDN edge — refreshes hourly without overloading Supabase
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
