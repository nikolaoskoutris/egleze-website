const fs = require('fs');

const SOURCE = 'index.html';
const TARGETS = ['shows.html', 'show.html'];
const CSS_START_MARKER = '/* EGLEZE CANONICAL FOOTER SYNC START */';
const CSS_END_MARKER = '/* EGLEZE CANONICAL FOOTER SYNC END */';
const FALLBACK_MARKER = '<!-- EGLEZE FOOTER FALLBACKS -->';

function fail(message) {
  console.error('[sync-show-footers] ' + message);
  process.exit(1);
}

const index = fs.readFileSync(SOURCE, 'utf8');

const sourceCssStart = index.indexOf('/* ── INSTITUTIONAL FOOTER');
if (sourceCssStart < 0) fail('Could not find the canonical footer CSS in index.html');
const sourceCssEnd = index.indexOf('\n.bottom-grid', sourceCssStart);
if (sourceCssEnd < 0) fail('Could not find the end of canonical footer CSS in index.html');
const canonicalCss = index.slice(sourceCssStart, sourceCssEnd).trim();

const sourceFooterMatch = index.match(/<!-- FOOTER -->\s*(<footer class="eg-footer">[\s\S]*?<\/footer>)/i);
if (!sourceFooterMatch) fail('Could not find the canonical footer HTML in index.html');
const canonicalFooter = '<!-- FOOTER -->\n' + sourceFooterMatch[1];

const canonicalCssBlock = `${CSS_START_MARKER}\n${canonicalCss}\n${CSS_END_MARKER}`;
const fallbackScript = `${FALLBACK_MARKER}\n<script>\n(function(){\n  if (typeof window.openContactModal !== 'function') {\n    window.openContactModal = function(){ window.location.href = 'mailto:hello@egleze.com'; };\n  }\n  if (typeof window.toggleMegaMenu !== 'function') {\n    window.toggleMegaMenu = function(){ window.location.href = '/#topics-dir'; };\n  }\n})();\n<\/script>`;

for (const target of TARGETS) {
  let html = fs.readFileSync(target, 'utf8');
  const before = html;

  const existingCss = new RegExp(
    CSS_START_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
    '[\\s\\S]*?' +
    CSS_END_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  if (existingCss.test(html)) {
    html = html.replace(existingCss, canonicalCssBlock);
  } else {
    const styleClose = html.lastIndexOf('</style>');
    if (styleClose < 0) fail(`${target}: no </style> found for canonical footer CSS`);
    html = html.slice(0, styleClose) + '\n' + canonicalCssBlock + '\n' + html.slice(styleClose);
  }

  const footerRegex = /(?:<!--[^>]*FOOTER[^>]*-->\s*)?<footer class="eg-footer">[\s\S]*?<\/footer>/i;
  if (!footerRegex.test(html)) fail(`${target}: existing eg-footer block not found`);
  html = html.replace(footerRegex, canonicalFooter);

  if (!html.includes(FALLBACK_MARKER)) {
    const bodyClose = html.lastIndexOf('</body>');
    if (bodyClose < 0) fail(`${target}: no </body> found for footer fallbacks`);
    html = html.slice(0, bodyClose) + '\n' + fallbackScript + '\n' + html.slice(bodyClose);
  }

  if (html === before) fail(`${target}: synchronizer made no changes`);
  fs.writeFileSync(target, html);
  console.log(`[sync-show-footers] updated ${target}`);
}

console.log('[sync-show-footers] shows.html and show.html now use the homepage footer exactly');
