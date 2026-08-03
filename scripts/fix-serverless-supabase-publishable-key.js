const fs = require('fs');

const oldKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';
const publishableKey = 'sb_publishable_3I2jAyKsQyMLvxuQG47rBw_UW_QSZLs';

for (const path of ['api/episode.js', 'api/sitemap.js']) {
  let src = fs.readFileSync(path, 'utf8');
  if (!src.includes(oldKey) && !src.includes(publishableKey)) {
    throw new Error(`${path}: expected Supabase key not found`);
  }
  src = src.replaceAll(oldKey, publishableKey);
  src = src.replace(/\s*Authorization:\s*`Bearer \$\{SUPABASE_ANON_KEY\}`,?\n/g, '\n');
  src = src.replace(/\s*Authorization:\s*`Bearer \$\{SUPABASE_KEY\}`,?\n/g, '\n');
  fs.writeFileSync(path, src);
}

console.log('Updated episode and sitemap server functions to the current publishable key.');
