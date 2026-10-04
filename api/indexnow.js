const SUPABASE_URL = 'https://kerijdhiasrvaxssjqqg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlcmlqZGhpYXNydmF4c3NqcXFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MjIxOTksImV4cCI6MjA5MzE5ODE5OX0.tyTa3XkkGh8bGWPIyGKNABf0n04rPiEnyTbaxjNFzLg';
const INDEXNOW_KEY = '16e68308a6204a49b198ab9957a8c2a6';
const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return {}; }
  }
  return body;
}

async function fetchApprovedStory(storyId) {
  const url = SUPABASE_URL + '/rest/v1/stories?id=eq.' + encodeURIComponent(storyId)
    + '&status=eq.approved&select=id,headline&limit=1';
  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }
  });
  if (!response.ok) throw new Error('Story lookup failed with HTTP ' + response.status);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] : null;
}

async function submitIndexNow(url, attempts) {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host: 'egleze.com',
        key: INDEXNOW_KEY,
        keyLocation: 'https://egleze.com/' + INDEXNOW_KEY + '.txt',
        urlList: [url]
      })
    });
    lastStatus = response.status;
    if (response.ok) return { ok: true, status: response.status, attempts: attempt };
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 200 * attempt));
  }
  return { ok: false, status: lastStatus, attempts };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const storyId = Number(parseBody(req.body).storyId);
  if (!Number.isInteger(storyId) || storyId <= 0) {
    return res.status(400).json({ ok: false, error: 'A valid storyId is required' });
  }

  try {
    const story = await fetchApprovedStory(storyId);
    if (!story || !story.headline) {
      return res.status(404).json({ ok: false, error: 'Approved story not found' });
    }

    const url = 'https://egleze.com/story/' + story.id + '-' + slugify(story.headline);
    const result = await submitIndexNow(url, 3);

    if (!result.ok) {
      console.error('[IndexNow] upstream rejected story', story.id, 'HTTP', result.status);
      return res.status(502).json({
        ok: false,
        error: 'IndexNow submission failed',
        upstreamStatus: result.status,
        attempts: result.attempts
      });
    }

    console.log('[IndexNow] submitted story', story.id, 'HTTP', result.status);
    return res.status(200).json({
      ok: true,
      storyId: story.id,
      url,
      upstreamStatus: result.status,
      attempts: result.attempts
    });
  } catch (error) {
    console.error('[IndexNow] server error:', error && error.message ? error.message : error);
    return res.status(500).json({ ok: false, error: 'IndexNow submission could not be completed' });
  }
}

module.exports = handler;
module.exports._test = { slugify, parseBody, fetchApprovedStory, submitIndexNow };
