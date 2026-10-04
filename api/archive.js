const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';
const PAGE_SIZE = 100;

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function slugify(value) {
  return String(value || '').toLowerCase()
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function validPage(value) {
  const parsed = Number.parseInt(String(value || '1'), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IE', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Europe/Dublin'
  }).format(date);
}

async function fetchPage(page) {
  const offset = (page - 1) * PAGE_SIZE;
  const query = 'stories?select=id,headline,show_name,topic,approved_at'
    + '&status=eq.approved'
    + '&order=approved_at.desc.nullslast,id.desc'
    + '&limit=' + PAGE_SIZE
    + '&offset=' + offset;
  const response = await fetch(SUPABASE_URL + '/rest/v1/' + query, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      Prefer: 'count=exact'
    }
  });
  if (!response.ok) throw new Error('Archive lookup failed with HTTP ' + response.status);
  const rows = await response.json();
  const range = response.headers.get('content-range') || '';
  const totalMatch = range.match(/\/(\d+)$/);
  return { rows: Array.isArray(rows) ? rows : [], total: totalMatch ? Number(totalMatch[1]) : 0 };
}

function renderArchive(rows, page, total) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canonical = 'https://egleze.com/archive' + (page > 1 ? '?page=' + page : '');
  const previous = page > 1 ? '/archive' + (page === 2 ? '' : '?page=' + (page - 1)) : '';
  const next = page < pages ? '/archive?page=' + (page + 1) : '';
  const cards = rows.map(story => {
    const url = '/story/' + story.id + '-' + slugify(story.headline);
    const meta = [story.topic, story.show_name, formatDate(story.approved_at)].filter(Boolean);
    return '      <article><a href="' + escapeHtml(url) + '"><h2>'
      + escapeHtml(story.headline) + '</h2><p>' + escapeHtml(meta.join(' · '))
      + '</p></a></article>';
  }).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Egleze story archive${page > 1 ? ' · Page ' + page : ''}</title>
  <meta name="description" content="Browse the complete chronological archive of source-linked podcast moments published by Egleze.">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${canonical}">
  ${previous ? '<link rel="prev" href="https://egleze.com' + previous + '">' : ''}
  ${next ? '<link rel="next" href="https://egleze.com' + next + '">' : ''}
  <style>
    :root{--paper:#f5f1e8;--card:#fffdf8;--ink:#141210;--muted:#6f6961;--red:#bb1919;--edge:#ddd5c7}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,serif}
    header,main,nav,footer{max-width:980px;margin:auto;padding-left:24px;padding-right:24px}
    header{padding-top:34px;padding-bottom:28px;border-bottom:1px solid var(--edge)}
    .brand{font-size:29px;font-weight:800;text-decoration:none;color:var(--ink)}.brand span{color:var(--red)}
    h1{font-size:clamp(34px,6vw,58px);line-height:1.05;margin:42px 0 12px}
    .intro{font-family:Arial,sans-serif;color:var(--muted);font-size:17px;max-width:680px}
    .count{font-family:Arial,sans-serif;color:var(--red);font-weight:700;margin:30px 0 14px}
    article{background:var(--card);border-top:1px solid var(--edge)}
    article:last-child{border-bottom:1px solid var(--edge)}
    article a{display:block;padding:20px;text-decoration:none;color:inherit}
    article a:hover h2{color:var(--red)}article h2{font-size:22px;line-height:1.25;margin:0 0 8px}
    article p{font:13px Arial,sans-serif;color:var(--muted);margin:0;text-transform:uppercase;letter-spacing:.04em}
    nav{display:flex;justify-content:space-between;align-items:center;padding-top:30px;padding-bottom:40px;font-family:Arial,sans-serif}
    nav a{color:var(--red);font-weight:700;text-decoration:none}.disabled{visibility:hidden}
    footer{border-top:1px solid var(--edge);padding-top:24px;padding-bottom:36px;font:13px Arial,sans-serif;color:var(--muted)}
    footer a{color:inherit}
  </style>
</head>
<body>
  <header><a class="brand" href="/"><span>E</span>gleze</a></header>
  <main>
    <h1>Story archive</h1>
    <p class="intro">Every approved Egleze moment, in chronological order, with its programme and source context preserved.</p>
    <div class="count">Page ${page} of ${pages} · ${total.toLocaleString('en-IE')} stories</div>
${cards || '    <p>No stories found on this page.</p>'}
  </main>
  <nav aria-label="Archive pagination">
    ${previous ? '<a href="' + previous + '">← Newer stories</a>' : '<span class="disabled">← Newer stories</span>'}
    <span>Page ${page} of ${pages}</span>
    ${next ? '<a href="' + next + '">Older stories →</a>' : '<span class="disabled">Older stories →</span>'}
  </nav>
  <footer><a href="/">Front page</a> · <a href="/shows.html">Shows</a> · <a href="/api.html">Connect with Egleze</a></footer>
</body>
</html>`;
}

async function handler(req, res) {
  const page = validPage(req.query && req.query.page);
  try {
    const result = await fetchPage(page);
    const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
    if (page > pages && result.total > 0) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).send('Archive page not found');
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=900, stale-while-revalidate=86400');
    return res.status(200).send(renderArchive(result.rows, page, result.total));
  } catch (error) {
    console.error('[archive]', error && error.message ? error.message : error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Archive temporarily unavailable');
  }
}

module.exports = handler;
module.exports._test = { PAGE_SIZE, escapeHtml, slugify, validPage, formatDate, renderArchive };
