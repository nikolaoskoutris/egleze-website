#!/usr/bin/env node
/**
 * build-story-pages.js
 *
 * Generates one HTML page per APPROVED story from Supabase.
 *
 * Inputs:
 *   - scripts/story-template.html  (master template with {{TOKEN}} placeholders)
 *   - Supabase: stories table, status=approved
 *
 * Output:
 *   - story/[slug].html for each approved story (one file per story)
 *
 * Usage:
 *   node scripts/build-story-pages.js
 *
 * Re-run whenever you:
 *   - Approve a batch of stories in the dashboard
 *   - Want stories to appear on Google
 *   - Change the template
 *
 * The slug format is: {id}-{slugified-headline}
 *   e.g., "490-trump-announces-iran-strike"
 *
 * Empty / unmatched topic slugs map to "society" as the fallback topic page.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ── CONFIG ───────────────────────────────────────────────────────
const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(__dirname, 'story-template.html');
const TOPIC_DATA_PATH = path.join(__dirname, 'topic-data.json');
const OUTPUT_DIR = path.join(ROOT, 'story');

// ── LOAD TEMPLATE & TOPIC DATA ───────────────────────────────────
console.log('Reading story template:', TEMPLATE_PATH);
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

console.log('Reading topic data:', TOPIC_DATA_PATH);
const topicData = JSON.parse(fs.readFileSync(TOPIC_DATA_PATH, 'utf8'));

// Build a topic-displayName → slug lookup, with case-insensitive matching
const topicNameToSlug = {};
topicData.topics.forEach(function(t) {
  topicNameToSlug[t.displayName.toLowerCase()] = t.slug;
});

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('Created output directory:', OUTPUT_DIR);
}

// ── HELPERS ──────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeJsonString(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function storySlug(story) {
  const base = slugify(story.headline || '');
  return story.id ? story.id + (base ? '-' + base : '') : base;
}

function topicSlugFromName(topicName) {
  if (!topicName) return 'society';
  const slug = topicNameToSlug[topicName.toLowerCase()];
  return slug || 'society';
}

function timeAgo(isoString) {
  if (!isoString) return 'recently';
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  if (diff < 86400) return Math.floor(diff / 3600) + ' hour' + (Math.floor(diff / 3600) === 1 ? '' : 's') + ' ago';
  if (diff < 604800) return Math.floor(diff / 86400) + ' day' + (Math.floor(diff / 86400) === 1 ? '' : 's') + ' ago';
  return new Date(isoString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function metaDescription(story) {
  // Prefer summary, fall back to quote, fall back to headline
  const text = story.summary || story.quote || story.headline || '';
  // Trim to ~155 chars for SEO
  if (text.length <= 155) return text;
  return text.slice(0, 152).replace(/\s+\S*$/, '') + '…';
}

// ── FETCH STORIES FROM SUPABASE ──────────────────────────────────
function fetchAllApprovedStories() {
  return new Promise(function(resolve, reject) {
    const url = SUPABASE_URL + '/rest/v1/stories' +
      '?select=*' +
      '&status=eq.approved' +
      '&order=created_at.desc';

    const req = https.get(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Accept': 'application/json',
        'Range': '0-9999' // up to 10k stories — bump if you grow past this
      }
    }, function(res) {
      let body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        if (res.statusCode !== 200 && res.statusCode !== 206) {
          return reject(new Error('Supabase HTTP ' + res.statusCode + ': ' + body.slice(0, 200)));
        }
        try {
          const parsed = JSON.parse(body);
          if (!Array.isArray(parsed)) return reject(new Error('Expected array, got: ' + typeof parsed));
          resolve(parsed);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('Supabase request timeout')); });
  });
}

// ── GENERATE ONE STORY PAGE ──────────────────────────────────────
function generateStoryPage(story) {
  let html = template;
  const slug = storySlug(story);
  const topicSlug = topicSlugFromName(story.topic);
  const topicName = story.topic || 'Society';
  const headline = story.headline || '';
  const description = metaDescription(story);
  const summary = story.summary || '';
  const quote = story.quote || '';
  const showName = story.show_name || '';
  const episode = story.episode || '';
  const sourceUrl = story.source_url || '#';
  const publishedISO = story.created_at || new Date().toISOString();
  const ytId = extractYouTubeId(sourceUrl);

  // Episode part: "· Episode 2187"
  const episodePart = episode ? ' <span class="story-meta-sep">·</span> ' + escapeHtml(episode) : '';
  // Clip duration part
  let clipDurPart = '';
  if (story.clip_start_seconds != null && story.clip_end_seconds != null) {
    const startN = parseInt(story.clip_start_seconds, 10);
    const endN = parseInt(story.clip_end_seconds, 10);
    if (!isNaN(startN) && !isNaN(endN) && endN > startN) {
      clipDurPart = ' <span class="story-meta-sep">·</span> ' + (endN - startN) + 's clip';
    }
  }

  // Video embed: YouTube iframe with start/end if clip data exists
  let videoEmbed;
  if (ytId) {
    let embedUrl = 'https://www.youtube.com/embed/' + ytId + '?rel=0&modestbranding=1&playsinline=1';
    const startN = parseInt(story.clip_start_seconds, 10);
    const endN = parseInt(story.clip_end_seconds, 10);
    if (!isNaN(startN) && startN > 0) embedUrl += '&start=' + startN;
    if (!isNaN(endN) && endN > 0 && endN > startN) embedUrl += '&end=' + endN;
    videoEmbed = '<iframe src="' + embedUrl + '" title="' + escapeHtml(headline) + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>';
  } else {
    videoEmbed = '<div class="story-video-fallback">Video preview unavailable. Tap "Watch full episode" below to view the source.</div>';
  }

  // Quote block (only render if there's a quote)
  const quoteBlock = quote ? '<blockquote class="story-quote">"' + escapeHtml(quote) + '"</blockquote>' : '';

  // Episode panel (only render if episode_summary or episode_key_points exist)
  const epSummary = (typeof story.episode_summary === 'string' && story.episode_summary.trim()) ? story.episode_summary.trim() : '';
  const epKeypoints = Array.isArray(story.episode_key_points)
    ? story.episode_key_points.filter(function(kp) { return typeof kp === 'string' && kp.trim().length > 0; })
    : [];
  let episodePanelHtml = '';
  if (epSummary || epKeypoints.length > 0) {
    episodePanelHtml = '<aside class="story-episode" aria-label="Episode summary">\n';
    episodePanelHtml += '  <div class="story-episode-eyebrow">From this episode</div>\n';
    if (epSummary) {
      episodePanelHtml += '  <h2 class="story-episode-h">Episode summary</h2>\n';
      episodePanelHtml += '  <p class="story-episode-summary">' + escapeHtml(epSummary) + '</p>\n';
    }
    if (epKeypoints.length > 0) {
      episodePanelHtml += '  <div class="story-episode-keypoints-label">Key moments</div>\n';
      episodePanelHtml += '  <ul class="story-episode-keypoints">\n';
      epKeypoints.forEach(function(kp) {
        episodePanelHtml += '    <li>' + escapeHtml(kp) + '</li>\n';
      });
      episodePanelHtml += '  </ul>\n';
    }
    episodePanelHtml += '</aside>';
  }

  // VideoObject JSON-LD (only if YouTube video)
  let videoJsonldBlock = '';
  if (ytId) {
    const videoUrl = 'https://www.youtube.com/watch?v=' + ytId;
    const thumbnailUrl = 'https://i.ytimg.com/vi/' + ytId + '/maxresdefault.jpg';
    videoJsonldBlock = '<script type="application/ld+json">\n' +
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "VideoObject",
        "name": headline,
        "description": description,
        "thumbnailUrl": [thumbnailUrl],
        "uploadDate": publishedISO,
        "contentUrl": videoUrl,
        "embedUrl": "https://www.youtube.com/embed/" + ytId,
        "publisher": {
          "@type": "NewsMediaOrganization",
          "name": "Egleze",
          "url": "https://egleze.com"
        }
      }, null, 2) + '\n</script>';
  }

  // Default OG image: YouTube thumbnail if available, otherwise site default
  const ogImage = ytId ? 'https://i.ytimg.com/vi/' + ytId + '/maxresdefault.jpg' : 'https://egleze.com/og-image.jpg';

  // ── REPLACEMENTS ──────────────────────────────────────────────
  // First: handle JSON-LD blocks (raw, not HTML-escaped)
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, function(fullMatch, jsonContent) {
    let updated = jsonContent
      .replaceAll('{{STORY_HEADLINE_JSON}}', escapeJsonString(headline))
      .replaceAll('{{STORY_META_DESCRIPTION_JSON}}', escapeJsonString(description))
      .replaceAll('{{STORY_TOPIC_JSON}}', escapeJsonString(topicName))
      .replaceAll('{{STORY_SHOW_NAME_JSON}}', escapeJsonString(showName))
      .replaceAll('{{STORY_HEADLINE}}', escapeJsonString(headline))
      .replaceAll('{{STORY_TOPIC}}', escapeJsonString(topicName))
      .replaceAll('{{STORY_SLUG}}', escapeJsonString(slug))
      .replaceAll('{{STORY_TOPIC_SLUG}}', escapeJsonString(topicSlug))
      .replaceAll('{{STORY_PUBLISHED_ISO}}', escapeJsonString(publishedISO))
      .replaceAll('{{STORY_OG_IMAGE}}', escapeJsonString(ogImage))
      .replaceAll('{{STORY_SOURCE_URL}}', escapeJsonString(sourceUrl));
    return '<script type="application/ld+json">' + updated + '</script>';
  });

  // Inject the dynamically-built VideoObject block at its placeholder
  html = html.replaceAll('{{STORY_VIDEO_JSONLD_BLOCK}}', videoJsonldBlock);

  // HTML-context replacements
  html = html.replaceAll('{{STORY_HEADLINE}}', escapeHtml(headline));
  html = html.replaceAll('{{STORY_META_DESCRIPTION}}', escapeHtml(description));
  html = html.replaceAll('{{STORY_TOPIC}}', escapeHtml(topicName));
  html = html.replaceAll('{{STORY_TOPIC_SLUG}}', topicSlug);
  html = html.replaceAll('{{STORY_SLUG}}', slug);
  html = html.replaceAll('{{STORY_SHOW_NAME}}', escapeHtml(showName));
  html = html.replaceAll('{{STORY_EPISODE_PART}}', episodePart);
  html = html.replaceAll('{{STORY_TIMEAGO}}', escapeHtml(timeAgo(publishedISO)));
  html = html.replaceAll('{{STORY_CLIP_DUR_PART}}', clipDurPart);
  html = html.replaceAll('{{STORY_VIDEO_EMBED}}', videoEmbed);
  html = html.replaceAll('{{STORY_QUOTE_BLOCK}}', quoteBlock);
  html = html.replaceAll('{{STORY_EPISODE_PANEL}}', episodePanelHtml);
  html = html.replaceAll('{{STORY_SUMMARY}}', escapeHtml(summary));
  html = html.replaceAll('{{STORY_SOURCE_URL}}', escapeHtml(sourceUrl));
  html = html.replaceAll('{{STORY_PUBLISHED_ISO}}', publishedISO);
  html = html.replaceAll('{{STORY_OG_IMAGE}}', ogImage);

  return { html: html, slug: slug };
}

// ── MAIN ─────────────────────────────────────────────────────────
(async function() {
  console.log('Fetching approved stories from Supabase...');
  let stories;
  try {
    stories = await fetchAllApprovedStories();
  } catch(e) {
    console.error('ERROR fetching stories:', e.message);
    process.exit(1);
  }

  console.log('Fetched', stories.length, 'approved stories');
  if (stories.length === 0) {
    console.log('No approved stories found. Nothing to generate.');
    process.exit(0);
  }

  let generated = 0;
  let skipped = 0;
  let validationFailed = 0;
  const slugCollisions = {};

  stories.forEach(function(story) {
    if (!story.id || !story.headline || !story.source_url) {
      console.warn('  Skipping incomplete story id=' + story.id);
      skipped++;
      return;
    }
    const { html, slug } = generateStoryPage(story);

    // Detect slug collisions (rare — only happens if 2 stories have same id+headline)
    if (slugCollisions[slug]) {
      console.warn('  SLUG COLLISION:', slug, '— overwriting');
    }
    slugCollisions[slug] = true;

    // Check for unreplaced tokens
    const leftoverTokens = html.match(/{{STORY_[A-Z_]+}}/g);
    if (leftoverTokens && leftoverTokens.length > 0) {
      console.error('  ✗ ' + slug + '.html has unreplaced tokens:', [...new Set(leftoverTokens)].slice(0, 3).join(', '));
      validationFailed++;
      return;
    }

    const outputPath = path.join(OUTPUT_DIR, slug + '.html');
    fs.writeFileSync(outputPath, html, 'utf8');
    generated++;
  });

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Build complete:');
  console.log('  Generated:        ' + generated);
  console.log('  Skipped:          ' + skipped + ' (incomplete)');
  console.log('  Validation fails: ' + validationFailed);
  console.log('  Output dir:       ' + OUTPUT_DIR);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (validationFailed > 0) {
    process.exit(1);
  }
})();
