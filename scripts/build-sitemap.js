#!/usr/bin/env node
/**
 * build-sitemap.js
 *
 * Generates sitemap.xml from:
 *   - Core static URLs (homepage, shows, legal, etc.)
 *   - Indexable topic pages (only topics with hasStories=true)
 *
 * Output: sitemap.xml in repo root.
 *
 * Note: Story URLs (/story/[slug]) are NOT yet generated — those come in a future
 * iteration when individual story pages are built. When they are, this script
 * should query Supabase for approved stories and add them to the sitemap.
 *
 * Usage:
 *   node scripts/build-sitemap.js
 *
 * Re-run whenever:
 *   - You change topic-data.json (e.g., flip a hasStories flag)
 *   - You add new core pages to the site
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_PATH = path.join(__dirname, 'topic-data.json');
const STORY_DIR = path.join(ROOT, 'story');
const OUTPUT_PATH = path.join(ROOT, 'sitemap.xml');

const SITE = 'https://egleze.com';
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// Core static URLs and their priority/changefreq metadata
const CORE_URLS = [
  { path: '/',          priority: 1.0, changefreq: 'hourly'  },
  { path: '/shows.html', priority: 0.8, changefreq: 'daily'   },
  { path: '/shorts.html', priority: 0.7, changefreq: 'hourly' },
  { path: '/legal.html', priority: 0.3, changefreq: 'monthly' }
];

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

const urlEntries = [];

// Core URLs
CORE_URLS.forEach(function(u) {
  urlEntries.push({
    loc: SITE + u.path,
    lastmod: TODAY,
    changefreq: u.changefreq,
    priority: u.priority
  });
});

// Topic URLs (only indexable ones)
let indexableTopicCount = 0;
let skippedTopicCount = 0;
data.topics.forEach(function(topic) {
  if (topic.hasStories) {
    urlEntries.push({
      loc: SITE + '/topic/' + topic.slug,
      lastmod: TODAY,
      changefreq: 'daily',
      priority: 0.6
    });
    indexableTopicCount++;
  } else {
    skippedTopicCount++;
  }
});

// Story URLs — scan /story directory for generated story HTML files
let storyCount = 0;
if (fs.existsSync(STORY_DIR)) {
  const storyFiles = fs.readdirSync(STORY_DIR).filter(function(f) {
    return f.endsWith('.html');
  });
  storyFiles.forEach(function(file) {
    const slug = file.replace(/\.html$/, '');
    // Use file mtime as lastmod for accuracy
    const stat = fs.statSync(path.join(STORY_DIR, file));
    const lastmod = stat.mtime.toISOString().slice(0, 10);
    urlEntries.push({
      loc: SITE + '/story/' + slug,
      lastmod: lastmod,
      changefreq: 'weekly',
      priority: 0.7
    });
    storyCount++;
  });
}

// Build XML
let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
urlEntries.forEach(function(entry) {
  xml += '  <url>\n';
  xml += '    <loc>' + entry.loc + '</loc>\n';
  xml += '    <lastmod>' + entry.lastmod + '</lastmod>\n';
  xml += '    <changefreq>' + entry.changefreq + '</changefreq>\n';
  xml += '    <priority>' + entry.priority.toFixed(1) + '</priority>\n';
  xml += '  </url>\n';
});
xml += '</urlset>\n';

fs.writeFileSync(OUTPUT_PATH, xml, 'utf8');

console.log('Sitemap generated: ' + OUTPUT_PATH);
console.log('  Core URLs:        ' + CORE_URLS.length);
console.log('  Indexable topics: ' + indexableTopicCount);
console.log('  Excluded topics:  ' + skippedTopicCount + ' (noindex / coming soon)');
console.log('  Story pages:      ' + storyCount);
console.log('  Total URLs:       ' + urlEntries.length);
console.log('');
console.log('Next steps:');
console.log('  1. Submit to Google Search Console: ' + SITE + '/sitemap.xml');
console.log('  2. Re-run this script anytime topic-data.json changes OR after running build-story-pages.js');
