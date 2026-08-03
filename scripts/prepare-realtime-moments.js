const fs = require('fs');

const file = 'index.html';
let html = fs.readFileSync(file, 'utf8');

function replaceOnce(search, replacement, label) {
  const first = html.indexOf(search);
  if (first === -1) throw new Error(`Missing expected homepage fragment: ${label}`);
  if (html.indexOf(search, first + search.length) !== -1) {
    throw new Error(`Expected one homepage fragment but found multiple: ${label}`);
  }
  html = html.replace(search, replacement);
}

replaceOnce(
  '<section class="news-wire" id="news-wire" aria-label="Today\'s news">',
  '<section class="news-wire" id="news-wire" aria-label="Real-time moments">',
  'wire aria label',
);

replaceOnce(
  '<h2 class="nw-title">Today\'s news<span class="nw-live">LIVE</span></h2>',
  '<h2 class="nw-title">Real-Time Moments<span class="nw-live">LIVE</span></h2>',
  'wire heading',
);

replaceOnce(
  '<span class="nw-sub">From the news desks · scroll for more ↓</span>',
  '<span class="nw-sub">Latest approved moments from long-form conversations · newest first</span>',
  'wire subtitle',
);

// The homepage no longer divides active sources into news versus conversations.
// Keep the helper name to minimise the patch, but make it an identity function so
// all approved moments can participate in the ordinary homepage shelves.
const newsNotInPattern = /function newsNotIn\(q\)\s*\{[\s\S]*?(?=async function loadNewsWire\(\))/;
if (!newsNotInPattern.test(html)) throw new Error('Could not locate newsNotIn helper');
html = html.replace(newsNotInPattern, 'function newsNotIn(q) { return q; }\n');

replaceOnce(
  "if (!sec || !window.NEWS_SHOWS || !window.NEWS_SHOWS.length) return;",
  "if (!sec) return;",
  'wire source-list guard',
);

replaceOnce(
  "        .in('show_name', window.NEWS_SHOWS)\n",
  '',
  'wire news-show inclusion filter',
);

// The old source classification is no longer needed before homepage loading.
html = html.replace(/^\s*await loadNewsShows\(\);[^\n]*\n/m, '');

html = html.replaceAll("Today's news", 'Real-Time Moments');
html = html.replaceAll('TODAY\'S NEWS', 'REAL-TIME MOMENTS');
html = html.replaceAll('Load older news', 'Load older moments');
html = html.replaceAll('load older news', 'load older moments');
html = html.replaceAll('older news', 'older moments');
html = html.replaceAll('[news-wire]', '[realtime-moments]');

// Guardrails: the former wire filter must be gone and the new heading/query must exist.
if (html.includes(".in('show_name', window.NEWS_SHOWS)")) {
  throw new Error('Former news-show inclusion filter still exists');
}
if (!html.includes('Real-Time Moments<span class="nw-live">LIVE</span>')) {
  throw new Error('New Real-Time Moments heading is missing');
}
if (!html.includes(".eq('status', 'approved')") || !html.includes(".order('created_at', { ascending: false })")) {
  throw new Error('Approved/newest-first wire query guard failed');
}

fs.writeFileSync(file, html);
console.log('Prepared conversations-first Real-Time Moments homepage.');
