const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function filesIn(directory) {
  return fs.readdirSync(directory)
    .filter(name => name.endsWith('.html'))
    .map(name => path.join(directory, name));
}

test('the shared pulse is loaded on every public static page and generator template', () => {
  const publicRoot = filesIn(root).filter(file => !['dashboard.html', 'reactions-test.html'].includes(path.basename(file)));
  const topicPages = filesIn(path.join(root, 'topic'));
  const templates = [path.join(root, 'scripts', 'story-template.html'), path.join(root, 'scripts', 'topic-template.html')];
  for (const file of [...publicRoot, ...topicPages, ...templates]) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<script defer src="\/js\/pulse\.js"><\/script>/, path.relative(root, file));
  }
});

test('server-rendered story and episode pages carry analytics context', () => {
  const story = fs.readFileSync(path.join(root, 'api', 'story.js'), 'utf8');
  const episode = fs.readFileSync(path.join(root, 'api', 'episode.js'), 'utf8');
  assert.match(story, /content_kind:'story'/);
  assert.match(story, /src="\/js\/pulse\.js"/);
  assert.match(episode, /content_kind:'episode'/);
  assert.match(episode, /src="\/js\/pulse\.js"/);
});

test('legacy GA loaders and cookie banner copy are removed', () => {
  const htmlFiles = [
    ...filesIn(root).filter(file => path.basename(file) !== 'dashboard.html'),
    ...filesIn(path.join(root, 'topic')),
    path.join(root, 'scripts', 'story-template.html'),
    path.join(root, 'scripts', 'topic-template.html'),
  ];
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag/);
    assert.doesNotMatch(html, /id="cookie-banner"/);
    assert.doesNotMatch(html, /We use essential cookies only/);
  }
});

test('privacy notice documents minimisation, consent and retention', () => {
  const legal = fs.readFileSync(path.join(root, 'legal.html'), 'utf8');
  assert.match(legal, /does not store raw IP addresses/i);
  assert.match(legal, /only after you accept/i);
  assert.match(legal, /automatically deleted after 180 days/i);
});

