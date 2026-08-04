const fs = require('fs');

const indexPath = 'index.html';
const workflowPath = '.github/workflows/add-google-play-homepage.yml';
const selfPath = 'scripts/add-google-play-homepage.js';

let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes('https://play.google.com/store/apps/details?id=com.egleze.app')) {
  const oldBlock = `      <div style="font-size:13px;line-height:1.6;color:#bcb09a;max-width:520px">Scan with your phone camera to add Egleze to your home screen — a fast, full-screen reading app, no app-store download needed. <a href="/install.html" style="color:#d6c79e;text-decoration:underline">Open the install guide →</a></div>`;

  const newBlock = `      <div style="font-size:13px;line-height:1.6;color:#bcb09a;max-width:560px">Install the Android app from Google Play, or scan the code to add the web app to your home screen. <a href="/install.html" style="color:#d6c79e;text-decoration:underline">Open the install guide →</a></div>\n      <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">\n        <a href="https://play.google.com/store/apps/details?id=com.egleze.app" target="_blank" rel="noopener" aria-label="Get Egleze on Google Play" style="display:inline-flex;align-items:center;gap:11px;background:#111;color:#fff;border:1px solid #3a332b;border-radius:7px;padding:8px 14px;text-decoration:none;min-width:182px">\n          <svg width="27" height="30" viewBox="0 0 27 30" aria-hidden="true" style="flex-shrink:0">\n            <path d="M1.7 1.6c-.44.5-.7 1.27-.7 2.27v22.27c0 1 .26 1.77.7 2.27l.09.09 12.47-12.47v-.3L1.79 1.51z" fill="#00d7fe"/>\n            <path d="M18.41 20.2l-4.15-4.16v-.3l4.16-4.16.09.05 4.93 2.8c1.41.8 1.41 2.12 0 2.92l-4.93 2.8z" fill="#ffce00"/>\n            <path d="M18.51 20.15l-4.25-4.26L1.7 28.45c.7.74 1.86.83 3.17.09l13.64-7.74z" fill="#ff3a44"/>\n            <path d="M18.51 11.63L4.87 3.89C3.56 3.15 2.4 3.24 1.7 3.98l12.56 12.06z" fill="#00f076"/>\n          </svg>\n          <span style="display:flex;flex-direction:column;line-height:1.05">\n            <span style="font-family:'Roboto Condensed',sans-serif;font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:#cfcfcf">Get it on</span>\n            <strong style="font-family:'DM Sans',sans-serif;font-size:18px;font-weight:500;letter-spacing:-.2px">Google Play</strong>\n          </span>\n        </a>\n      </div>`;

  if (!html.includes(oldBlock)) {
    throw new Error('Expected install block not found; refusing to patch index.html.');
  }

  html = html.replace(oldBlock, newBlock);

  const sameAsNeedle = `    "https://www.youtube.com/@Egleze",`;
  const sameAsReplacement = `    "https://www.youtube.com/@Egleze",\n    "https://play.google.com/store/apps/details?id=com.egleze.app",`;
  if (html.includes(sameAsNeedle) && !html.includes(sameAsReplacement)) {
    html = html.replace(sameAsNeedle, sameAsReplacement);
  }

  fs.writeFileSync(indexPath, html);
}

for (const tempPath of [selfPath, workflowPath]) {
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
}

console.log('Google Play homepage entry prepared.');
