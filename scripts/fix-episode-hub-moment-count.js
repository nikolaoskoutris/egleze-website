const fs = require('fs');
const path = 'api/story.js';
let src = fs.readFileSync(path, 'utf8');

function replaceOnce(label, from, to) {
  const count = src.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  src = src.replace(from, to);
}

if (src.includes('episodeBundle.momentCount')) {
  console.log('Moment count already corrected.');
  process.exit(0);
}

src = src.replaceAll(
  "return { episode: null, siblings: [] };",
  "return { episode: null, siblings: [], momentCount: 0 };",
);

replaceOnce(
  'bundle return',
  '    return { episode, siblings };',
  '    return { episode, siblings, momentCount: Array.isArray(siblingRows) ? siblingRows.length : 0 };',
);

replaceOnce(
  'render signature',
  'function renderStoryHtml(story, artworkUrl, episode, siblingMoments) {',
  'function renderStoryHtml(story, artworkUrl, episode, siblingMoments, episodeMomentCount) {',
);

replaceOnce(
  'episode card count',
  "((siblingMoments || []).length + 1) + ' Egleze moments'",
  "(episodeMomentCount || ((siblingMoments || []).length + 1)) + ' Egleze moments'",
);

replaceOnce(
  'handler count',
  'renderStoryHtml(story, artwork, episodeBundle.episode, episodeBundle.siblings)',
  'renderStoryHtml(story, artwork, episodeBundle.episode, episodeBundle.siblings, episodeBundle.momentCount)',
);

fs.writeFileSync(path, src);
console.log('Corrected story episode-card moment count.');
