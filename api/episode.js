// /api/episode.js — server-rendered canonical episode hubs.

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (_) {
    return '';
  }
}

function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  if (!seconds) return '';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function isoDuration(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  if (!seconds) return undefined;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remaining = seconds % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remaining ? `${remaining}S` : ''}`;
}

async function supabaseFetch(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
      'Accept-Profile': 'public'
    }
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchEpisode(id) {
  const rows = await supabaseFetch(
    `episodes?id=eq.${encodeURIComponent(id)}&status=eq.published&select=*&limit=1`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function fetchMoments(episodeId) {
  const rows = await supabaseFetch(
    `stories?episode_id=eq.${encodeURIComponent(episodeId)}&status=eq.approved&select=id,headline,summary,quote,topic,show_name,created_at,clip_start_seconds,clip_end_seconds,source_url&order=created_at.asc`
  );
  return Array.isArray(rows) ? rows : [];
}

function renderNotFound() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Episode not found — Egleze</title><meta name="robots" content="noindex">
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:80px auto;padding:0 24px;color:#171717}a{color:#bb1919}</style>
</head><body><h1>Episode not found</h1><p>This episode overview is unavailable or still under editorial review.</p><p><a href="/">Return to Egleze</a></p></body></html>`;
}

function renderEpisode(episode, moments) {
  const title = episode.title || `${episode.show_name || 'Podcast'} episode`;
  const slug = `${episode.id}-${slugify(title)}`;
  const canonicalUrl = `https://egleze.com/episodes/${slug}`;
  const sourceUrl = episode.source_url || episode.youtube_url || '';
  const image = episode.artwork_url || 'https://egleze.com/og-default.png';
  const publishedLabel = formatDate(episode.published_at);
  const durationLabel = formatDuration(episode.duration_seconds);
  const keyPoints = Array.isArray(episode.key_points) ? episode.key_points.filter(Boolean) : [];
  const summary = episode.summary || '';
  const momentCount = moments.length;

  const momentLinks = moments.map((moment, index) => {
    const momentUrl = `/story/${moment.id}-${slugify(moment.headline)}`;
    return `<article class="moment-card">
      <div class="moment-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="moment-copy">
        <div class="moment-topic">${escapeHtml(moment.topic || 'Moment')}</div>
        <h2><a href="${momentUrl}">${escapeHtml(moment.headline)}</a></h2>
        ${moment.summary ? `<p>${escapeHtml(moment.summary)}</p>` : ''}
        <a class="moment-link" href="${momentUrl}">Read this moment →</a>
      </div>
    </article>`;
  }).join('');

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: title,
    description: summary || title,
    url: canonicalUrl,
    datePublished: episode.published_at || undefined,
    duration: isoDuration(episode.duration_seconds),
    image: image ? [image] : undefined,
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: episode.show_name || 'Egleze source show'
    },
    associatedMedia: sourceUrl ? {
      '@type': 'VideoObject',
      name: title,
      description: summary || title,
      contentUrl: sourceUrl,
      embedUrl: episode.youtube_video_id
        ? `https://www.youtube.com/embed/${episode.youtube_video_id}`
        : undefined,
      thumbnailUrl: episode.youtube_video_id
        ? [`https://i.ytimg.com/vi/${episode.youtube_video_id}/maxresdefault.jpg`]
        : undefined,
      uploadDate: episode.published_at || undefined
    } : undefined,
    hasPart: moments.map(moment => ({
      '@type': 'NewsArticle',
      headline: moment.headline,
      url: `https://egleze.com/story/${moment.id}-${slugify(moment.headline)}`
    }))
  };

  const keyPointsHtml = keyPoints.length
    ? `<section class="section">
        <div class="eyebrow">Key points</div>
        <ul class="key-points">${keyPoints.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
      </section>`
    : '';

  const sourceEmbed = episode.youtube_video_id
    ? `<div class="source-video">
        <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">
          <img src="https://i.ytimg.com/vi/${episode.youtube_video_id}/maxresdefault.jpg"
               alt="${escapeHtml(title)}" onerror="this.src='https://i.ytimg.com/vi/${episode.youtube_video_id}/hqdefault.jpg'">
          <span class="play">▶</span>
        </a>
      </div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — Episode overview | Egleze</title>
<meta name="description" content="${escapeHtml(summary || `Episode overview and ${momentCount} source-linked moments from ${episode.show_name || 'this conversation'}.`)}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
<link rel="canonical" href="${canonicalUrl}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Egleze">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(summary || `${momentCount} Egleze moments from this episode.`)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${canonicalUrl}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(schema)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Playfair+Display:wght@700;900&family=Roboto+Condensed:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--red:#bb1919;--ink:#171512;--muted:#777066;--paper:#f6f1e7;--line:#ddd5c7;--white:#fff}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:'DM Sans',sans-serif;line-height:1.65}
.site-header{height:78px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 28px}
.logo{font-family:'Playfair Display',serif;font-size:34px;font-weight:900;text-decoration:none;color:var(--ink)}.logo span{color:var(--red)}
.back{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted);text-decoration:none}
main{max-width:980px;margin:0 auto;padding:48px 28px 90px}
.breadcrumb{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:24px}.breadcrumb a{color:var(--red);text-decoration:none}
.hero{display:grid;grid-template-columns:150px 1fr;gap:28px;align-items:start}
.artwork{width:150px;height:150px;object-fit:cover;background:#271c15;border:1px solid var(--line)}
.episode-label{font-family:'Roboto Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--red);margin-bottom:9px}
h1{font-family:'Playfair Display',serif;font-size:46px;line-height:1.1;margin:0 0 15px;letter-spacing:-.7px}
.meta{font-family:'Roboto Condensed',sans-serif;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)}
.source-video{margin:36px 0 42px;background:#111;position:relative;aspect-ratio:16/9;overflow:hidden}.source-video img{width:100%;height:100%;object-fit:cover;opacity:.82}.source-video .play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:84px;height:84px;border-radius:50%;background:var(--red);color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;padding-left:5px}
.section{background:#fff;border:1px solid var(--line);padding:30px 34px;margin-top:24px}
.eyebrow{font-family:'Roboto Condensed',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--red);margin-bottom:15px}
.summary{font-size:18px;line-height:1.75;margin:0}.key-points{margin:0;padding-left:22px}.key-points li{margin:0 0 13px;font-size:16px}
.moments-head{display:flex;align-items:end;justify-content:space-between;border-bottom:3px solid var(--ink);padding-bottom:12px;margin:48px 0 18px}.moments-head h2{font-family:'Playfair Display',serif;font-size:30px;margin:0}.moments-head span{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}
.moment-card{display:grid;grid-template-columns:62px 1fr;background:#fff;border-bottom:1px solid var(--line);padding:24px 26px}.moment-number{font-family:'Playfair Display',serif;font-size:28px;color:#cfc7b9;font-weight:700}.moment-topic{font-family:'Roboto Condensed',sans-serif;font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:var(--red);font-weight:700}.moment-card h2{font-family:'Playfair Display',serif;font-size:22px;line-height:1.25;margin:5px 0 8px}.moment-card h2 a{color:var(--ink);text-decoration:none}.moment-card h2 a:hover{color:var(--red)}.moment-card p{color:#575149;margin:0 0 10px;font-size:14px}.moment-link{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--red);font-weight:700;text-decoration:none}
.source-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px}.btn{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;font-weight:700;text-decoration:none;padding:11px 18px;border:1px solid var(--ink);color:var(--ink);background:#fff}.btn.primary{background:var(--red);border-color:var(--red);color:#fff}
footer{text-align:center;padding:38px 20px;border-top:1px solid var(--line);font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:var(--muted)}
@media(max-width:700px){main{padding:30px 18px 64px}.hero{grid-template-columns:82px 1fr;gap:16px}.artwork{width:82px;height:82px}h1{font-size:31px}.source-video .play{width:64px;height:64px;font-size:22px}.section{padding:24px 20px}.summary{font-size:17px}.moment-card{grid-template-columns:46px 1fr;padding:20px 16px}.moment-card h2{font-size:19px}.moments-head{display:block}.moments-head span{display:block;margin-top:6px}}
</style>
</head>
<body>
<header class="site-header">
  <a class="logo" href="/"><span>E</span>gleze</a>
  <a class="back" href="/">← Real-Time Moments</a>
</header>
<main>
  <nav class="breadcrumb"><a href="/">Home</a> · <a href="/shows/${slugify(episode.show_name)}">${escapeHtml(episode.show_name || 'Show')}</a> · Episode</nav>
  <section class="hero">
    ${image ? `<img class="artwork" src="${escapeHtml(image)}" alt="${escapeHtml(episode.show_name || '')}">` : '<div class="artwork"></div>'}
    <div>
      <div class="episode-label">Episode overview</div>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">${escapeHtml(episode.show_name || '')}${publishedLabel ? ` · ${escapeHtml(publishedLabel)}` : ''}${durationLabel ? ` · ${escapeHtml(durationLabel)}` : ''} · ${momentCount} Egleze ${momentCount === 1 ? 'moment' : 'moments'}</div>
    </div>
  </section>

  ${sourceEmbed}

  <section class="section">
    <div class="eyebrow">Episode summary</div>
    <p class="summary">${escapeHtml(summary).replace(/\n+/g, '</p><p class="summary">')}</p>
  </section>

  ${keyPointsHtml}

  <div class="source-actions">
    ${sourceUrl ? `<a class="btn primary" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Watch original episode</a>` : ''}
    <a class="btn" href="/shows/${slugify(episode.show_name)}">More from ${escapeHtml(episode.show_name || 'this show')}</a>
  </div>

  <div class="moments-head">
    <h2>${momentCount} moments from this episode</h2>
    <span>Source-linked · editorially selected</span>
  </div>
  <section>${momentLinks}</section>
</main>
<footer>Egleze · Consequential moments from long-form conversations</footer>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const rawSlug = String((req.query && req.query.slug) || '');
  const idMatch = rawSlug.match(/^(\d+)(?:-|$)/);
  if (!idMatch) {
    res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFound());
    return;
  }

  try {
    const episode = await fetchEpisode(Number(idMatch[1]));
    if (!episode) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFound());
      return;
    }
    const moments = await fetchMoments(episode.id);
    if (!moments.length) {
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFound());
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.status(200).send(renderEpisode(episode, moments));
  } catch (error) {
    console.error('[episode-hub]', error);
    res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8')
      .send('<h1>Episode temporarily unavailable</h1>');
  }
};
