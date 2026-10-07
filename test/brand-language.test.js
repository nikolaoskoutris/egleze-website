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
