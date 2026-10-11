const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createHandler({ createClient, env, apple }) {
  return async function handle(req) {
    const origin = req.headers.get('origin');
    const allowed = !origin || ['https://egleze.com', 'https://www.egleze.com', 'capacitor://localhost', 'http://localhost', 'https://localhost'].includes(origin) ||
      /^https:\/\/egleze-website-[a-z0-9-]+-nicholaskoutris-7308s-projects\.vercel\.app$/.test(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    if (origin && allowed) Object.assign(headers, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    });
    const reply = (status, data) => new Response(JSON.stringify(data), { status, headers });
    if (!allowed) return reply(403, { error: 'origin_not_allowed' });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    const bearer = req.headers.get('authorization') || '';
    const match = bearer.match(/^Bearer ([^\s]+)$/i);
    if (!match) return reply(401, { error: 'sign_in_required' });
    let stage = 'request';
    try {
      const text = await req.text();
      if (text.length > 12000) return reply(413, { error: 'request_too_large' });
      let body;
      try { body = JSON.parse(text); } catch { return reply(400, { error: 'invalid_request' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || !['delete', 'store-apple-credential'].includes(body.action)) return reply(400, { error: 'invalid_request' });
      const keys = body.action === 'delete' ? ['action', 'confirmation'] : ['action', 'refresh_token'];
      if (Object.keys(body).some(key => !keys.includes(key))) return reply(400, { error: 'invalid_request' });
      if (body.action === 'delete' && body.confirmation !== 'DELETE') return reply(400, { error: 'confirmation_required' });
      if (body.action === 'store-apple-credential' && (typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 8192)) return reply(400, { error: 'invalid_credential' });
      const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY'), anon = env('SUPABASE_ANON_KEY');
      if (!url || !key || !anon) return reply(503, { error: 'service_unavailable' });
      const options = { auth: { persistSession: false, autoRefreshToken: false } };
      const caller = createClient(url, anon, { ...options, global: { headers: { Authorization: bearer } } });
      const { data: userData, error: userError } = await caller.auth.getUser(match[1]);
      const user = userData?.user;
      if (userError || !user || !UUID.test(user.id)) return reply(401, { error: 'sign_in_required' });
      const { data: active, error: activeError } = await caller.rpc('egleze_session_active');
      if (activeError) return reply(503, { error: 'session_check_unavailable' });
      if (active !== true) return reply(401, { error: 'sign_in_required' });
      const admin = createClient(url, key, options);
      const subjects = (user.identities || []).filter(i => i.provider === 'apple').map(i => i.identity_data?.sub || i.provider_id || i.id).filter(Boolean);
      if (body.action === 'store-apple-credential') {
        if (!subjects.length) return reply(403, { error: 'apple_identity_required' });
        stage = 'apple_validation';
        const credential = await apple.validate(body.refresh_token, subjects);
        stage = 'credential_storage';
        const { error } = await admin.rpc('egleze_store_apple_credential', { p_user_id: user.id, p_token: credential.refreshToken, p_client_id: credential.clientId });
        if (error) return reply(503, { error: 'credential_storage_failed' });
        return reply(200, { stored: true });
      }
      stage = 'credential_read';
      const { data: credential, error: credentialError } = await admin.rpc('egleze_get_apple_credential', { p_user_id: user.id });
      if (credentialError) return reply(503, { error: 'deletion_unavailable' });
      let appleAccess = subjects.length ? 'manual_revocation_required' : 'not_applicable';
      if (credential) {
        stage = 'apple_revocation';
        await apple.revoke(credential);
        appleAccess = 'revoked';
      }
      stage = 'session_revocation';
      const { error: signOutError } = await admin.auth.admin.signOut(match[1], 'global');
      if (signOutError) return reply(503, { error: 'session_revocation_failed' });
      stage = 'account_deletion';
      const { error: deletionError } = await admin.auth.admin.deleteUser(user.id, false);
      if (deletionError) return reply(503, { error: 'account_deletion_failed', sign_in_again: true });
      return reply(200, { deleted: true, apple_access: appleAccess });
    } catch {
      // Never log request bodies, authorization headers, provider tokens or keys.
      return reply(503, { error: stage + '_failed' });
    }
  };
}
