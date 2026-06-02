// /api/tiktok-callback.js
// TikTok OAuth redirect target.
//
// TikTok redirects the user here after they authorise the app:
//   https://egleze.com/api/tiktok-callback?code=XXXX&state=YYYY
// or, on rejection:
//   https://egleze.com/api/tiktok-callback?error=...&error_description=...
//
// This handler shows the code on a clean page. The user copies it
// into a local Node script (linkedin-style) that exchanges the code
// for an access token using the client_secret (kept off the website).

export default function handler(req, res) {
  const { code, state, error, error_description, scopes } = req.query || {};

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const css = `
    body{
      margin:0;background:#0e0a06;color:#f5f0e6;
      font-family:'DM Sans',system-ui,sans-serif;font-size:15px;line-height:1.6;
      min-height:100vh;display:flex;align-items:center;justify-content:center;padding:48px 20px;
    }
    .card{
      max-width:640px;width:100%;padding:48px 40px;
      border:1px solid rgba(245,240,230,0.16);border-radius:8px;background:#15100a;
    }
    h1{
      font-family:Georgia,'Playfair Display',serif;font-weight:800;
      font-size:30px;line-height:1.08;letter-spacing:-0.5px;margin:0 0 8px;
    }
    h1 .e{color:#d92020}
    .eyebrow{
      font-size:11px;letter-spacing:0.26em;text-transform:uppercase;
      color:#d92020;margin-bottom:18px;
    }
    .lead{color:rgba(245,240,230,0.7);margin:14px 0 28px}
    .label{
      font-size:11px;letter-spacing:0.22em;text-transform:uppercase;
      color:rgba(245,240,230,0.5);margin-top:24px;margin-bottom:6px;
    }
    .box{
      background:#0a0704;border:1px solid rgba(245,240,230,0.16);border-radius:6px;
      padding:14px 16px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;
      font-size:13px;color:#f5f0e6;word-break:break-all;line-height:1.5;
      user-select:all;
    }
    .err{color:#ff9b8a}
    .note{color:rgba(245,240,230,0.5);font-size:13px;margin-top:32px;line-height:1.7}
  `;

  if (error) {
    res.status(400).send(`<!doctype html><html><head><meta charset="utf-8"><title>Egleze · X auth failed</title><style>${css}</style></head>
<body><div class="card">
  <div class="eyebrow">Egleze · X</div>
  <h1><span class="e">A</span>uthorisation failed.</h1>
  <p class="lead err">${escapeHtml(String(error))}</p>
  ${error_description ? `<p class="lead">${escapeHtml(String(error_description))}</p>` : ''}
  <p class="note">Close this tab and re-run the OAuth script from your terminal.</p>
</div></body></html>`);
    return;
  }

  if (!code) {
    res.status(400).send(`<!doctype html><html><head><meta charset="utf-8"><title>Egleze · X callback</title><style>${css}</style></head>
<body><div class="card">
  <div class="eyebrow">Egleze · X</div>
  <h1><span class="e">N</span>o authorisation code received.</h1>
  <p class="lead">This page is only used as the OAuth redirect target. Open the X authorisation URL from your terminal to begin.</p>
</div></body></html>`);
    return;
  }

  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><title>Egleze · X authorised</title><style>${css}</style></head>
<body><div class="card">
  <div class="eyebrow">Egleze · X</div>
  <h1><span class="e">A</span>uthorised.</h1>
  <p class="lead">Copy the values below and paste them into your local terminal when the script asks.</p>

  <div class="label">Authorisation code</div>
  <div class="box" id="code">${escapeHtml(String(code))}</div>

  ${state ? `<div class="label">State</div><div class="box">${escapeHtml(String(state))}</div>` : ''}
  ${scopes ? `<div class="label">Scopes granted</div><div class="box">${escapeHtml(String(scopes))}</div>` : ''}

  <p class="note">This code expires in a few minutes — exchange it for an access token now via the local script. You can close this tab once the script confirms success.</p>
</div></body></html>`);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
