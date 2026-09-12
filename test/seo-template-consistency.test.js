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
