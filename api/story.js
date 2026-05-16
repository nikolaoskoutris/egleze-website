// ─────────────────────────────────────────────────────────────────
// /api/story.js — Vercel serverless function for story permalinks.
// 
// Routes /story/[id-slug] → fetches story from Supabase by ID,
// returns a fully-rendered HTML page with proper Open Graph,
// Twitter Card, and JSON-LD NewsArticle schema for share previews.
//
// URL format: /story/{id}-{slug-words-derived-from-headline}
// Lookup is by ID only — slug words are decorative for SEO/readability.
// ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

// Derive a URL-safe slug from a headline. Same algorithm used by shorts.html
// and the homepage so slugs are consistent across the site.
function slugify(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")  // smart single quotes
    .replace(/[\u201C\u201D]/g, '"')  // smart double quotes
    .replace(/[^\w\s-]/g, '')         // strip non-word characters
    .replace(/\s+/g, '-')             // spaces to hyphens
    .replace(/-+/g, '-')              // collapse multiple hyphens
    .replace(/^-|-$/g, '')            // trim leading/trailing hyphens
    .substring(0, 80);                // cap at 80 chars
}

// Escape HTML special chars to prevent XSS via story content.
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Format an ISO date string as "Month DD, YYYY" for display.
function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch (e) { return ''; }
}

// Extract YouTube video ID from any YouTube URL form
// (youtu.be, watch?v=, embed/, shorts/, live/, v/)
function extractYouTubeId(url) {
  if (!url) return null;
  var s = String(url);
  var m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Fetch the story (and optionally its show artwork) from Supabase.
async function fetchStory(id) {
  const url = `${SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&status=eq.approved&select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Accept-Profile': 'public'
    }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function fetchShowArtwork(showName) {
  if (!showName) return null;
  const url = `${SUPABASE_URL}/rest/v1/shows?name=eq.${encodeURIComponent(showName)}&select=artwork_url&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept-Profile': 'public'
      }
    });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    return rows[0].artwork_url || null;
  } catch (e) { return null; }
}

// Render the full HTML response for a found story.
function renderStoryHtml(story, artworkUrl) {
  const title = story.headline || 'Egleze Story';
  const description = story.summary || story.headline || '';
  const slug = slugify(title);
  const canonicalUrl = `https://egleze.com/story/${story.id}-${slug}`;
  const ogImage = artworkUrl || 'https://egleze.com/og-default.png';
  const datePublished = story.created_at || new Date().toISOString();
  const dateModified = story.updated_at || datePublished;
  const showName = story.show_name || '';
  const topic = story.topic || '';
  const episodeName = story.episode || '';
  const quote = story.quote || '';
  const episodeSummary = story.episode_summary || '';
  const keyPoints = Array.isArray(story.episode_key_points) ? story.episode_key_points : [];

  // JSON-LD structured data for Google News + rich results
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'headline': title,
    'description': description,
    'image': ogImage ? [ogImage] : undefined,
    'datePublished': datePublished,
    'dateModified': dateModified,
    'author': {
      '@type': 'Organization',
      'name': 'Egleze',
      'url': 'https://egleze.com'
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'Egleze',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://egleze.com/logo.png'
      }
    },
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': canonicalUrl
    },
    'articleSection': topic,
    'isBasedOn': showName ? `Podcast: ${showName} — ${episodeName}` : undefined
  };

  const keyPointsHtml = keyPoints.length > 0
    ? `<section class="key-points">
         <h2>Key takeaways</h2>
         <ul>${keyPoints.map(kp => `<li>${escapeHtml(kp)}</li>`).join('')}</ul>
       </section>`
    : '';

  const episodeSummaryHtml = episodeSummary
    ? `<section class="episode-summary">
         <h2>About this episode</h2>
         <p>${escapeHtml(episodeSummary).replace(/\n/g, '</p><p>')}</p>
       </section>`
    : '';

  const quoteHtml = quote
    ? `<blockquote class="story-quote">"${escapeHtml(quote)}"</blockquote>`
    : '';

  // Video block — YouTube embed with click-to-play poster.
  // Auto-starts at clip_start_seconds and ends at clip_end_seconds when
  // both are set; otherwise plays the full source video.
  const videoId = extractYouTubeId(story.source_url);
  const startSec = (typeof story.clip_start_seconds === 'number' && story.clip_start_seconds >= 0) ? story.clip_start_seconds : null;
  const endSec = (typeof story.clip_end_seconds === 'number' && startSec !== null && story.clip_end_seconds > startSec) ? story.clip_end_seconds : null;
  const videoParams = [
    'autoplay=1',
    'rel=0',
    'modestbranding=1',
    'playsinline=1',
    startSec !== null ? `start=${startSec}` : null,
    endSec !== null ? `end=${endSec}` : null
  ].filter(Boolean).join('&');
  const embedUrl = videoId ? `https://www.youtube.com/embed/${videoId}?${videoParams}` : null;
  const posterUrl = videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : null;
  const videoObjectLd = videoId ? `\n  <script type="application/ld+json">${JSON.stringify({
    "@context":"https://schema.org","@type":"VideoObject",
    "name": title,
    "description": description,
    "thumbnailUrl": ["https://i.ytimg.com/vi/" + videoId + "/maxresdefault.jpg"],
    "uploadDate": datePublished,
    "contentUrl": "https://www.youtube.com/watch?v=" + videoId,
    "embedUrl": "https://www.youtube.com/embed/" + videoId,
    "publisher": {"@type":"NewsMediaOrganization","name":"Egleze","url":"https://egleze.com"}
  })}</script>` : '';
  const videoHtml = embedUrl
    ? `<div class="video-block">
         <div class="video-wrap" id="video-wrap" data-embed="${escapeHtml(embedUrl)}">
           <img class="video-poster" src="${escapeHtml(posterUrl)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='https://i.ytimg.com/vi/${videoId}/hqdefault.jpg';">
           <button class="video-play" type="button" aria-label="Play video">
             <svg viewBox="0 0 68 48" width="68" height="48" aria-hidden="true">
               <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#bb1919"/>
               <path d="M45 24L27 14v20" fill="#fff"/>
             </svg>
           </button>
         </div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Egleze</title>
  <!-- Consent-gated analytics: no GA network call until consent (shared egleze_cookie) -->
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('consent','default',{'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','analytics_storage':'denied','wait_for_update':500});
    gtag('js', new Date());
    window.EGLEZE_GA_ID='G-18MJKYD86Y';
    window.eglezeLoadAnalytics=function(){
      if(window.__eglezeGALoaded)return; window.__eglezeGALoaded=true;
      gtag('consent','update',{'analytics_storage':'granted'});
      var s=document.createElement('script');s.async=true;
      s.src='https://www.googletagmanager.com/gtag/js?id='+window.EGLEZE_GA_ID;
      document.head.appendChild(s);
      gtag('config',window.EGLEZE_GA_ID,{'anonymize_ip':true});
    };
    try{ if(localStorage.getItem('egleze_cookie')==='accepted') window.eglezeLoadAnalytics(); }catch(e){}
  </script>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonicalUrl}">
  <meta name="google-site-verification" content="rNxDHlJLJlcENKY5EyvvYSllFud6qDhckUJMbPfKDHo">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:site_name" content="Egleze">
  <meta property="article:published_time" content="${datePublished}">
  <meta property="article:section" content="${escapeHtml(topic)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@egleze_news">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">

  <!-- JSON-LD -->
  <script type="application/ld+json">${JSON.stringify(schema)}</script>${videoObjectLd}

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Roboto+Condensed:wght@400;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">

  <style>
    :root{
      --red:#bb1919; --dark:#0e0a06; --ink:#1a1a1a; --light:#faf6ee;
      --border:#e8e3d3; --muted:#888;
    }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'DM Sans',system-ui,sans-serif;background:#fff;color:#111;line-height:1.6;-webkit-font-smoothing:antialiased}
    .header{border-bottom:0.5px solid var(--border);padding:18px 24px;display:flex;align-items:center;justify-content:space-between;background:#fff}
    .logo{font-family:'Playfair Display',serif;font-size:32px;font-weight:900;color:var(--dark);text-decoration:none;letter-spacing:-0.8px;line-height:1}
    .logo .e-red{color:var(--red)}
    .header-back{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);text-decoration:none}
    .header-back:hover{color:var(--red)}
    main{max-width:760px;margin:0 auto;padding:32px 24px 80px}
    .breadcrumb{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:24px}
    .breadcrumb a{color:var(--red);text-decoration:none}
    .breadcrumb a:hover{text-decoration:underline}
    .topic-label{display:inline-block;background:var(--red);color:#fff;font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:5px 11px;font-weight:700;margin-bottom:18px}
    h1.headline{font-family:'Playfair Display',serif;font-size:42px;font-weight:900;line-height:1.15;color:var(--dark);margin-bottom:16px;letter-spacing:-0.5px}
    .meta{font-family:'Roboto Condensed',sans-serif;font-size:12px;letter-spacing:1px;color:var(--muted);text-transform:uppercase;margin-bottom:28px;border-bottom:0.5px solid var(--border);padding-bottom:18px}
    .meta strong{color:#222;font-weight:700}
    .artwork-block{margin:32px 0;display:flex;gap:18px;align-items:center;padding:18px;background:var(--light);border-left:3px solid var(--red)}
    .artwork-block img{width:80px;height:80px;object-fit:cover;flex-shrink:0;border:0.5px solid var(--border)}
    .artwork-block .show-info{flex:1}
    .artwork-block .show-name{font-family:'Playfair Display',serif;font-size:18px;font-weight:700;color:var(--dark);line-height:1.2}
    .artwork-block .episode-name{font-family:'Roboto Condensed',sans-serif;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:6px;line-height:1.4}
    .video-block{margin:24px 0 32px}
    .video-wrap{position:relative;aspect-ratio:16/9;background:#000;cursor:pointer;overflow:hidden}
    .video-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
    .video-poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
    .video-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:transparent;border:0;cursor:pointer;padding:0;transition:transform 0.15s}
    .video-wrap:hover .video-play{transform:translate(-50%,-50%) scale(1.08)}
    .video-wrap.playing .video-poster,.video-wrap.playing .video-play{display:none}
    .summary{font-family:'DM Sans',sans-serif;font-size:18px;line-height:1.65;color:#222;margin:24px 0 32px;font-weight:400}
    .story-quote{font-family:'Playfair Display',serif;font-size:24px;font-style:italic;line-height:1.4;color:var(--dark);border-left:4px solid var(--red);padding:8px 0 8px 24px;margin:32px 0}
    .episode-summary, .key-points{margin-top:40px;padding-top:32px;border-top:0.5px solid var(--border)}
    .episode-summary h2, .key-points h2{font-family:'Playfair Display',serif;font-size:22px;font-weight:700;margin-bottom:16px;color:var(--dark)}
    .episode-summary p{margin-bottom:14px;font-size:16px;line-height:1.65}
    .key-points ul{padding-left:20px}
    .key-points li{margin-bottom:10px;font-size:16px;line-height:1.55}
    .actions{margin-top:48px;padding-top:32px;border-top:0.5px solid var(--border);display:flex;gap:12px;flex-wrap:wrap}
    .btn{font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;padding:10px 18px;font-weight:700;text-decoration:none;border:1px solid var(--dark);color:var(--dark);transition:all 0.15s}
    .btn:hover{background:var(--dark);color:#fff}
    .btn.primary{background:var(--red);color:#fff;border-color:var(--red)}
    .btn.primary:hover{background:var(--dark);border-color:var(--dark)}
    .footer{text-align:center;padding:48px 24px;border-top:0.5px solid var(--border);margin-top:48px;font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted)}
    .footer a{color:var(--red);text-decoration:none}

    @media (max-width:760px){
      .header{padding:14px 18px}
      .logo{font-size:26px}
      main{padding:20px 18px 60px}
      h1.headline{font-size:30px}
      .summary{font-size:17px}
      .story-quote{font-size:20px;padding-left:18px}
      .artwork-block{padding:14px}
      .artwork-block img{width:60px;height:60px}
      .artwork-block .show-name{font-size:15px}
    }
  </style>
</head>
<body>
  <header class="header">
    <a href="/" class="logo"><span class="e-red">E</span>gleze</a>
    <a href="/" class="header-back">← All stories</a>
  </header>
  <main>
    <nav class="breadcrumb">
      <a href="/">Home</a>
      ${topic ? ` › <a href="/topic/${slugify(topic)}">${escapeHtml(topic)}</a>` : ''}
    </nav>
    ${topic ? `<div class="topic-label">${escapeHtml(topic)}</div>` : ''}
    <h1 class="headline">${escapeHtml(title)}</h1>
    <div class="meta">
      ${showName ? `<strong>${escapeHtml(showName)}</strong>` : ''}
      ${showName && episodeName ? ' · ' : ''}
      ${episodeName ? escapeHtml(episodeName) : ''}
      ${(showName || episodeName) ? ' · ' : ''}
      ${formatDate(datePublished)}
    </div>

    ${videoHtml}

    ${artworkUrl ? `
    <div class="artwork-block">
      <img src="${escapeHtml(artworkUrl)}" alt="${escapeHtml(showName)}" loading="lazy">
      <div class="show-info">
        <div class="show-name">${escapeHtml(showName)}</div>
        <div class="episode-name">${escapeHtml(episodeName)}</div>
      </div>
    </div>` : ''}

    ${quoteHtml}

    <div class="summary">${escapeHtml(description)}</div>

    ${episodeSummaryHtml}

    ${keyPointsHtml}

    <div class="actions">
      <a href="/" class="btn primary">More stories</a>
      ${showName ? `<a href="/shows/${slugify(showName)}" class="btn">More from ${escapeHtml(showName)}</a>` : ''}
    </div>
  </main>
  <footer class="footer">
    <a href="/">Egleze</a> &nbsp;·&nbsp; The most important moments from independent podcasts, surfaced daily
  </footer>
  <script>
    // Click-to-play: replace poster with iframe on click
    (function(){
      var wrap = document.getElementById('video-wrap');
      if (!wrap) return;
      function play(){
        if (wrap.classList.contains('playing')) return;
        var embed = wrap.getAttribute('data-embed');
        if (!embed) return;
        var iframe = document.createElement('iframe');
        iframe.setAttribute('src', embed);
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('title', 'Egleze clip');
        wrap.appendChild(iframe);
        wrap.classList.add('playing');
      }
      wrap.addEventListener('click', play);
      var btn = wrap.querySelector('.video-play');
      if (btn) btn.addEventListener('click', function(e){ e.stopPropagation(); play(); });
    })();
  </script>
</body>
</html>`;
}

// 404 fallback when story not found.
function render404Html(slug) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Story not found — Egleze</title>
  <meta name="robots" content="noindex">
  <style>
    body{font-family:system-ui,sans-serif;max-width:600px;margin:80px auto;padding:24px;text-align:center;color:#222}
    h1{font-size:32px;margin-bottom:14px}
    p{color:#666;margin-bottom:24px}
    a{color:#bb1919;text-decoration:none;font-weight:600}
  </style>
</head>
<body>
  <h1>Story not found</h1>
  <p>We couldn't find the story you're looking for. It may have been removed or the link is incorrect.</p>
  <p><a href="/">← Back to Egleze</a></p>
</body>
</html>`;
}

// Vercel serverless handler.
module.exports = async (req, res) => {
  try {
    const slug = (req.query.slug || '').toString();
    // URL format: {id}-{slug-words}. Extract numeric ID prefix.
    const idMatch = slug.match(/^(\d+)/);
    if (!idMatch) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(render404Html(slug));
      return;
    }
    const storyId = parseInt(idMatch[1], 10);
    const story = await fetchStory(storyId);
    if (!story) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(404).send(render404Html(slug));
      return;
    }
    const artwork = await fetchShowArtwork(story.show_name);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
    res.status(200).send(renderStoryHtml(story, artwork));
  } catch (err) {
    console.error('[/api/story] error:', err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send(render404Html(''));
  }
};
