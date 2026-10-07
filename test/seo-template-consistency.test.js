const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('generated topic pages match indexability metadata and declare site icons', () => {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'scripts/topic-data.json'), 'utf8'));
  assert.equal(data.topics.filter(topic => topic.hasStories).length, 25);

  data.topics.forEach(topic => {
    const html = fs.readFileSync(path.join(root, 'topic', `${topic.slug}.html`), 'utf8');
    const expectedRobots = topic.hasStories
      ? 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
      : 'noindex, follow';
    assert.match(html, new RegExp(`<meta name="robots" content="${expectedRobots}">`));
    assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any">/);
    assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png">/);
  });
});

test('dynamic templates do not reuse import timestamps as source publication dates', () => {
  const story = fs.readFileSync(path.join(root, 'api/story.js'), 'utf8');
  const episode = fs.readFileSync(path.join(root, 'api/episode.js'), 'utf8');

  assert.doesNotMatch(story, /episode\.published_at \|\| episode\.updated_at/);
  assert.match(story, /By Egleze Editorial Desk/);
  assert.doesNotMatch(story, /"publisher": \{"@type":"NewsMediaOrganization","name":"Egleze"/);
  assert.match(episode, /const publishedLabel = formatDate\(episode\.published_at\)/);
});


test('story pages expose citation-oriented content and unrestricted snippets', () => {
  const story = fs.readFileSync(path.join(root, 'api/story.js'), 'utf8');

  assert.match(story, /<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">/);
  assert.match(story, /'articleBody': description/);
  assert.match(story, /'SpeakableSpecification'/);
  assert.match(story, /What was said/);
  assert.match(story, /Source and context/);
  assert.match(story, /Watch the source segment/);
  assert.match(story, /underlying claim has not been independently established by Egleze/);
  assert.match(story, /Verification status/);
  assert.match(story, /Independently verified/);
  assert.match(story, /Supporting sources/);
  assert.match(story, /Correction/);
});

test('episode hubs expose question-led summaries, identities and timestamped sources', () => {
  const episode = fs.readFileSync(path.join(root, 'api/episode.js'), 'utf8');

  assert.match(episode, /What happened in this episode\?/);
  assert.match(episode, /What are the key points\?/);
  assert.match(episode, /Who is speaking\?/);
  assert.match(episode, /How is this page sourced\?/);
  assert.match(episode, /Check original/);
  assert.match(episode, /speaker_name/);
  assert.match(episode, /SpeakableSpecification/);
});
