const fs = require('fs');

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

function replaceRequired(search, replacement, label) {
  if (!html.includes(search)) throw new Error(`Missing expected fragment: ${label}`);
  html = html.replace(search, replacement);
}

replaceRequired(
  `  <!-- REAL-TIME MOMENTS — wire band: stories from editorial_type='news' shows, newest first.\n     Hidden until loadNewsWire() has ≥3 stories. Conversations shelves below exclude these shows. -->`,
  `  <!-- REAL-TIME MOMENTS — all approved stories, newest Egleze publication first.\n     Source selection is controlled upstream by the monitored/paused show list. -->`,
  'wire HTML comment',
);

replaceRequired(
  `// ── REAL-TIME MOMENTS WIRE — shows tagged editorial_type='news' in Supabase ──\n// One list, two uses: the wire band queries IN(list); the daily + weekly\n// shelves exclude via newsNotIn(). Editorial choice (hand-picked) and Most\n// watched (popularity chart) intentionally stay unfiltered.\nwindow.NEWS_SHOWS = [];\nasync function loadNewsShows() {\n  if (!db && !initDB()) return;\n  try {\n    var { data, error } = await db.from('shows').select('name').eq('editorial_type', 'news');\n    if (!error && data) window.NEWS_SHOWS = data.map(function(r){ return r.name; }).filter(Boolean);\n    console.log('[realtime-moments] news shows loaded: ' + window.NEWS_SHOWS.length);\n  } catch(e) { console.log('[realtime-moments] shows load failed:', e); }\n}\nfunction newsNotIn(q) { return q; }`,
  `// ── REAL-TIME MOMENTS WIRE ─────────────────────────────────────\n// Every approved story may appear here. Sources are included or paused at\n// ingestion, so the homepage does not maintain a second eligibility list.`,
  'legacy news-source helper block',
);

html = html.replaceAll('loadNewsWire', 'loadRealtimeMoments');

replaceRequired(
  `    // Default (unfiltered) homepage shelf: keep the wire's news shows out so\n    // conversations aren't drowned. Topic browsing keeps news included.\n    if (!topic) query = newsNotIn(query);\n`,
  `    // Source eligibility is controlled upstream. All approved stories may\n    // participate in the homepage and topic shelves.\n`,
  'legacy lower-shelf exclusion',
);

html = html.replace(
  `    // Paged fetch — .range() walks back through the whole approved news\n    // archive, 40 at a time. No date cap: the button below keeps loading`,
  `    // Paged fetch — .range() walks back through the approved moments\n    // archive, 40 at a time. No date cap: the button below keeps loading`,
);

if (html.includes('window.NEWS_SHOWS') || html.includes('loadNewsShows') || html.includes('newsNotIn(')) {
  throw new Error('Legacy news-source homepage logic remains');
}
if (!html.includes('async function loadRealtimeMoments()')) {
  throw new Error('Real-time moments loader was not renamed');
}
if (!html.includes(".eq('status', 'approved')\n        .order('created_at', { ascending: false })")) {
  throw new Error('Real-time moments query is not approved/newest-first');
}

fs.writeFileSync(file, html);
console.log('Finalized Real-Time Moments homepage mechanics and comments.');
