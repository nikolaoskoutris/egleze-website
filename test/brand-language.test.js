const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenVendor = ['cl', 'aude'].join('');
const checkedExtensions = new Set(['.html', '.js', '.md', '.txt', '.json']);

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === '.git' || entry.name === 'node_modules') return [];
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return checkedExtensions.has(path.extname(entry.name)) ? [fullPath] : [];
  });
}

test('website source contains no public-facing references to the removed vendor', () => {
  const violations = sourceFiles(root).filter(file => {
    const contents = fs.readFileSync(file, 'utf8');
    return contents.toLowerCase().includes(forbiddenVendor);
  });
  assert.deepEqual(violations, []);
});

test('public copy contains no stale August launch campaign', () => {
  const publicPages = ['index.html', 'about.html', 'legal.html', 'api.html', 'for-podcasters.html'];
  const staleLaunchPattern = /(?:launch(?:ing|es)?[^\n]{0,40}(?:1\s+august|1\s+aug|august\s+1)|countdown to 1 august)/i;
  const violations = publicPages.filter(file => staleLaunchPattern.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(violations, []);
});

test('editorial trust copy avoids unqualified archive-wide guarantees', () => {
  const publicPages = ['about.html', 'legal.html', 'api.html', 'for-podcasters.html'];
  const absoluteClaimPattern = /(?:we vouch for provenance|all quotes are|all sources are|attribution, always|fully attributed)/i;
  const violations = publicPages.filter(file => absoluteClaimPattern.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(violations, []);
});
