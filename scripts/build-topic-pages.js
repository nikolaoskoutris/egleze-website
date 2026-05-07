#!/usr/bin/env node
/**
 * build-topic-pages.js
 *
 * Generates 26 topic pages (one per category) from:
 *   - scripts/topic-template.html  (the master template with {{TOKEN}} placeholders)
 *   - scripts/topic-data.json      (slug, displayName, SEO meta, hasStories flag for each topic)
 *
 * Output: 26 HTML files in topic/[slug].html
 *
 * Usage:
 *   node scripts/build-topic-pages.js
 *
 * Re-run whenever you:
 *   - Change topic-data.json (e.g., flip a hasStories flag)
 *   - Change topic-template.html (template/design updates)
 *   - Add a new category
 */

const fs = require('fs');
const path = require('path');

// Paths
const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(__dirname, 'topic-template.html');
const DATA_PATH = path.join(__dirname, 'topic-data.json');
const OUTPUT_DIR = path.join(ROOT, 'topic');

// Read inputs
console.log('Reading template:', TEMPLATE_PATH);
const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

console.log('Reading data:', DATA_PATH);
const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

if (!Array.isArray(data.topics)) {
  console.error('ERROR: topic-data.json must have a "topics" array');
  process.exit(1);
}

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('Created output directory:', OUTPUT_DIR);
}

// Robots directive based on hasStories
function robotsDirective(hasStories) {
  if (hasStories) {
    return 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1';
  }
  return 'noindex, follow';
}

// Escape for HTML attribute values: `<meta content="...">` etc.
// Escapes &, <, >, ", '
function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape for HTML body text: `<h1>...</h1>`, `<p>...</p>`
// Escapes &, <, > but leaves quotes alone (they're fine in body content)
function escapeHtmlBody(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape for embedding inside a JSON string (used inside <script type="application/ld+json">)
// JSON requires proper escaping of " \ and control chars, but NOT HTML entities
function escapeJsonString(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// Generate one file from template + topic data
function generateTopicPage(topic) {
  let html = template;

  // Two distinct sets of replacements depending on context:
  //   1. HTML attribute / meta tag context → escapeHtmlAttr
  //   2. HTML body text context → escapeHtmlBody (with ampersands as &amp;)
  //   3. JSON-LD context → escapeJsonString (raw chars, not HTML-escaped)
  //
  // Strategy: Use different placeholder tokens for each context.
  //
  // - {{TOPIC_DISPLAY_NAME}}        → HTML body text (e.g., visible h1)
  // - {{TOPIC_DISPLAY_NAME_ATTR}}   → HTML attribute (e.g., meta content)
  // - {{TOPIC_DISPLAY_NAME_JSON}}   → JSON string value
  //
  // To minimize template churn, we can detect context by checking the surrounding
  // text in the template. But it's cleaner to add explicit markers in the template.
  //
  // SIMPLEST FIX (no template change): Apply HTML escape but use raw display name
  // inside a separate placeholder for the JSON-LD block, processed BEFORE the HTML escape.

  // Pre-process: Replace JSON-LD specific tokens FIRST with raw values (no HTML escape)
  // The template has \"name\": \"{{TOPIC_DISPLAY_NAME}}\" inside <script type=ld+json>
  // We need raw "AI & Tech" there, not "AI &amp; Tech".
  //
  // Trick: we'll do JSON-LD replacements via a different marker that we add to the template.
  // But to keep the template simple, we'll do a targeted regex that only replaces
  // the placeholder when it appears INSIDE a <script type="application/ld+json"> block.

  // Step 1: For all <script type="application/ld+json"> blocks, replace tokens with JSON-escaped values
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, function(fullMatch, jsonContent) {
    let updated = jsonContent
      .replaceAll('{{TOPIC_SLUG}}', escapeJsonString(topic.slug))
      .replaceAll('{{TOPIC_DISPLAY_NAME}}', escapeJsonString(topic.displayName))
      .replaceAll('{{TOPIC_SEO_TITLE}}', escapeJsonString(topic.seoTitle))
      .replaceAll('{{TOPIC_SEO_DESCRIPTION}}', escapeJsonString(topic.seoDescription));
    return '<script type="application/ld+json">' + updated + '</script>';
  });

  // Step 2: Replace the boolean placeholder for JS code (no quotes, no escape)
  html = html.replaceAll('{{TOPIC_HAS_STORIES_BOOL}}', topic.hasStories ? 'true' : 'false');

  // Step 2b: Replace the JS-context-safe display name (raw text, JS-string safe)
  // This goes inside JavaScript string literals like: var TOPIC_DISPLAY_NAME = "...";
  // We need raw "AI & Tech" here, NOT HTML-escaped "AI &amp; Tech".
  // Escape only what's needed for JS string safety (backslash, double-quote, newlines).
  function escapeJs(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  }
  html = html.replaceAll('{{TOPIC_DISPLAY_NAME_JS}}', escapeJs(topic.displayName));

  // Step 3: Replace the robots directive (plain text, no HTML special chars)
  html = html.replaceAll('{{TOPIC_ROBOTS_DIRECTIVE}}', robotsDirective(topic.hasStories));

  // Step 4: For everything else (HTML body + meta tag attrs), use HTML-attribute-safe escaping.
  // This is safe for both contexts (visible body text and content="..." attrs)
  // Apostrophes get &#39; which is safe everywhere.
  html = html.replaceAll('{{TOPIC_SLUG}}', topic.slug); // slug never has special chars
  html = html.replaceAll('{{TOPIC_DISPLAY_NAME}}', escapeHtmlAttr(topic.displayName));
  html = html.replaceAll('{{TOPIC_SEO_TITLE}}', escapeHtmlAttr(topic.seoTitle));
  html = html.replaceAll('{{TOPIC_SEO_DESCRIPTION}}', escapeHtmlAttr(topic.seoDescription));

  return html;
}

// Run
let indexable = 0;
let noindex = 0;
const summary = [];

data.topics.forEach(function(topic) {
  if (!topic.slug || !topic.displayName) {
    console.warn('Skipping invalid topic:', topic);
    return;
  }
  const html = generateTopicPage(topic);
  const outputPath = path.join(OUTPUT_DIR, topic.slug + '.html');
  fs.writeFileSync(outputPath, html, 'utf8');
  if (topic.hasStories) indexable++; else noindex++;
  summary.push({
    slug: topic.slug,
    name: topic.displayName,
    indexable: topic.hasStories,
    bytes: html.length
  });
  console.log('  ✓', topic.slug + '.html', `(${(html.length / 1024).toFixed(1)} KB)`, topic.hasStories ? '[indexable]' : '[noindex]');
});

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Build complete:');
console.log(`  Total pages:    ${data.topics.length}`);
console.log(`  Indexable:      ${indexable}`);
console.log(`  Noindex:        ${noindex}`);
console.log(`  Output dir:     ${OUTPUT_DIR}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Verify no leftover {{TOKEN}} placeholders in any output file
console.log('');
console.log('Validating output files for unreplaced tokens...');
let validationFailed = false;
data.topics.forEach(function(topic) {
  const outputPath = path.join(OUTPUT_DIR, topic.slug + '.html');
  const content = fs.readFileSync(outputPath, 'utf8');
  const leftoverTokens = content.match(/{{TOPIC_[A-Z_]+(?:_BOOL)?}}/g);
  if (leftoverTokens && leftoverTokens.length > 0) {
    console.error(`  ✗ ${topic.slug}.html has unreplaced tokens:`, [...new Set(leftoverTokens)].join(', '));
    validationFailed = true;
  }
});

if (!validationFailed) {
  console.log('  ✓ All files validated — no unreplaced tokens.');
}
