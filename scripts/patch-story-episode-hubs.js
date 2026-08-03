const fs = require('fs');

const path = 'api/story.js';
let src = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const count = src.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  src = src.replace(from, to);
}

if (src.includes('async function fetchEpisodeBundle(')) {
  console.log('Story renderer already patched.');
  process.exit(0);
}

replaceOnce(
  'insert episode fetch helpers',
  '\n// Render the full HTML response for a found story.\n',
  `\nfunction formatDuration(totalSeconds) {\n  const seconds = Number(totalSeconds || 0);\n  if (!seconds) return '';\n  const hours = Math.floor(seconds / 3600);\n  const minutes = Math.floor((seconds % 3600) / 60);\n  return hours ? hours + 'h ' + minutes + 'm' : minutes + 'm';\n}\n\nasync function fetchEpisodeBundle(episodeId, currentStoryId) {\n  if (!episodeId) return { episode: null, siblings: [] };\n  try {\n    const headers = {\n      'apikey': SUPABASE_ANON_KEY,\n      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,\n      'Accept-Profile': 'public'\n    };\n    const episodeRes = await fetch(\n      SUPABASE_URL + '/rest/v1/episodes?id=eq.' + encodeURIComponent(episodeId) + '&status=eq.published&select=*&limit=1',\n      { headers }\n    );\n    if (!episodeRes.ok) return { episode: null, siblings: [] };\n    const episodeRows = await episodeRes.json();\n    const episode = episodeRows && episodeRows[0];\n    if (!episode) return { episode: null, siblings: [] };\n\n    const siblingRes = await fetch(\n      SUPABASE_URL + '/rest/v1/stories?episode_id=eq.' + encodeURIComponent(episodeId) + '&status=eq.approved&select=id,headline,topic,created_at&order=created_at.asc',\n      { headers }\n    );\n    const siblingRows = siblingRes.ok ? await siblingRes.json() : [];\n    const siblings = Array.isArray(siblingRows)\n      ? siblingRows.filter(function(row){ return Number(row.id) !== Number(currentStoryId); }).slice(0, 4)\n      : [];\n    return { episode, siblings };\n  } catch (e) {\n    console.log('[/api/story] episode bundle unavailable:', e.message || e);\n    return { episode: null, siblings: [] };\n  }\n}\n\n// Render the full HTML response for a found story.\n`
);

replaceOnce(
  'render signature',
  'function renderStoryHtml(story, artworkUrl) {',
  'function renderStoryHtml(story, artworkUrl, episode, siblingMoments) {'
);

replaceOnce(
  'episode variables',
  "  const episodeSummary = story.episode_summary || '';\n  const keyPoints = Array.isArray(story.episode_key_points) ? story.episode_key_points : [];",
  "  const episodeSummary = episode ? '' : (story.episode_summary || '');\n  const keyPoints = episode ? [] : (Array.isArray(story.episode_key_points) ? story.episode_key_points : []);\n  const episodeUrl = episode ? `https://egleze.com/episodes/${episode.id}-${slugify(episode.title, { full: true })}` : '';"
);

replaceOnce(
  'schema episode relationship',
  "    'articleSection': topic,\n    'isBasedOn': showName ? `Podcast: ${showName} — ${episodeName}` : undefined",
  "    'articleSection': topic,\n    'isBasedOn': story.source_url || (showName ? `Podcast: ${showName} — ${episodeName}` : undefined),\n    'isPartOf': episodeUrl ? {\n      '@type': 'PodcastEpisode',\n      '@id': episodeUrl,\n      'name': episode.title\n    } : undefined"
);

replaceOnce(
  'insert episode card html',
  "  const quoteHtml = quote\n",
  `  const episodeCardHtml = episode ? \`<section class="episode-card">\n      <div class="episode-card-label">From this episode</div>\n      <div class="episode-card-main">\n        \${episode.artwork_url || artworkUrl ? \`<img src="\${escapeHtml(episode.artwork_url || artworkUrl)}" alt="\${escapeHtml(episode.show_name || showName)}" loading="lazy">\` : ''}\n        <div class="episode-card-copy">\n          <div class="episode-card-show">\${escapeHtml(episode.show_name || showName)}</div>\n          <h2>\${escapeHtml(episode.title || episodeName)}</h2>\n          <div class="episode-card-meta">\${[formatDate(episode.published_at || episode.updated_at), formatDuration(episode.duration_seconds), ((siblingMoments || []).length + 1) + ' Egleze moments'].filter(Boolean).join(' · ')}</div>\n        </div>\n      </div>\n      <a class="episode-card-link" href="\${episodeUrl}">Read episode summary and key points →</a>\n    </section>\` : '';\n\n  const siblingMomentsHtml = episode && Array.isArray(siblingMoments) && siblingMoments.length\n    ? \`<section class="sibling-moments">\n        <h2>More moments from this episode</h2>\n        \${siblingMoments.map(function(item){\n          const url = '/story/' + item.id + '-' + slugify(item.headline, { full: true });\n          return '<a href="' + url + '"><span>' + escapeHtml(item.topic || 'Moment') + '</span>' + escapeHtml(item.headline) + '<b>→</b></a>';\n        }).join('')}\n      </section>\`\n    : '';\n\n  const quoteHtml = quote\n`
);

replaceOnce(
  'episode card css',
  "    .episode-summary, .key-points{margin-top:40px;padding-top:32px;border-top:0.5px solid var(--border)}",
  "    .episode-card{margin-top:40px;border:1px solid var(--border);background:var(--light);padding:22px}\n    .episode-card-label{font-family:'Roboto Condensed',sans-serif;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--red);font-weight:700;margin-bottom:14px}\n    .episode-card-main{display:flex;gap:16px;align-items:center}.episode-card-main img{width:82px;height:82px;object-fit:cover;border:1px solid var(--border);flex-shrink:0}\n    .episode-card-show{font-family:'Roboto Condensed',sans-serif;font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:var(--red);font-weight:700}.episode-card h2{font-family:'Playfair Display',serif;font-size:20px;line-height:1.25;margin:4px 0 7px}.episode-card-meta{font-size:11px;color:var(--muted)}\n    .episode-card-link{display:block;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);font-family:'Roboto Condensed',sans-serif;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:var(--red);font-weight:700;text-decoration:none}\n    .sibling-moments{margin-top:34px}.sibling-moments h2{font-family:'Playfair Display',serif;font-size:21px;margin-bottom:10px}.sibling-moments a{display:grid;grid-template-columns:120px 1fr 20px;gap:12px;padding:13px 0;border-bottom:1px solid var(--border);color:var(--dark);text-decoration:none;font-size:14px}.sibling-moments a span{font-family:'Roboto Condensed',sans-serif;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:var(--red);font-weight:700}.sibling-moments a b{color:var(--red)}\n    .episode-summary, .key-points{margin-top:40px;padding-top:32px;border-top:0.5px solid var(--border)}"
);

replaceOnce(
  'replace repeated sections',
  "    ${episodeSummaryHtml}\n\n    ${keyPointsHtml}",
  "    ${episodeCardHtml}\n\n    ${siblingMomentsHtml}\n\n    ${episodeSummaryHtml}\n\n    ${keyPointsHtml}"
);

replaceOnce(
  'handler episode fetch',
  "    const artwork = await fetchShowArtwork(story.show_name);\n    res.setHeader('Content-Type', 'text/html; charset=utf-8');\n    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');\n    res.status(200).send(renderStoryHtml(story, artwork));",
  "    const [artwork, episodeBundle] = await Promise.all([\n      fetchShowArtwork(story.show_name),\n      fetchEpisodeBundle(story.episode_id, story.id)\n    ]);\n    res.setHeader('Content-Type', 'text/html; charset=utf-8');\n    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');\n    res.status(200).send(renderStoryHtml(story, artwork, episodeBundle.episode, episodeBundle.siblings));"
);

fs.writeFileSync(path, src);
console.log('Patched api/story.js for canonical episode hubs.');
