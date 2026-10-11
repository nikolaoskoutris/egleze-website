const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const UID = '12345678-1234-1234-1234-123456789abc';

async function harness(overrides = {}) {
  const { createHandler } = await import('../supabase/functions/account-lifecycle/handler.mjs');
  const calls = [];
  const user = { id: UID, identities: overrides.appleUser ? [{ provider: 'apple', identity_data: { sub: 'apple-person' } }] : [] };
  const caller = {
    auth: { getUser: async token => { calls.push(['verify', token]); return { data: { user }, error: overrides.userError }; } },
    rpc: async name => { calls.push([name]); return { data: overrides.active ?? true, error: overrides.sessionError }; },
  };
  const admin = {
    rpc: async (name, args) => { calls.push([name, args]); return { data: overrides.credential || null, error: overrides.rpcError }; },
    auth: { admin: {
      signOut: async (...args) => { calls.push(['signOut', ...args]); return { error: overrides.signOutError }; },
      deleteUser: async (...args) => { calls.push(['deleteUser', ...args]); return { error: overrides.deleteError }; },
    } },
  };
  const handler = createHandler({
    env: name => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'server' })[name],
    createClient: (url, key, options) => {
      if (key === 'server') { assert.equal(options.global, undefined); return admin; }
      assert.equal(options.global.headers.Authorization, 'Bearer user-jwt'); return caller;
    },
    apple: {
      validate: async (token, subjects) => { calls.push(['validateApple', token, subjects]); if (overrides.appleError) throw Error('SECRET'); return { refreshToken: 'verified-apple-token', clientId: 'com.egleze.app.signin' }; },
      revoke: async credential => { calls.push(['revokeApple', credential]); if (overrides.appleError) throw Error('SECRET'); },
    },
  });
  async function request(body = { action: 'delete', confirmation: 'DELETE' }, headers = {}, method = 'POST') {
    const response = await handler(new Request('https://example.test/account-lifecycle', {
      method, headers: { authorization: 'Bearer user-jwt', origin: 'https://egleze.com', ...headers },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    }));
    return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
  }
  return { request, calls };
}

test('deletion only targets the verified user and revokes every session before hard deletion', async () => {
  const h = await harness();
  assert.deepEqual((await h.request()).body, { deleted: true, apple_access: 'not_applicable' });
  assert.deepEqual(h.calls.slice(-2), [['signOut', 'user-jwt', 'global'], ['deleteUser', UID, false]]);
});
test('rejects missing authentication, foreign targets, unconfirmed deletion and malformed requests before any client access', async () => {
  for (const [body, headers, expected] of [
    [{ action: 'delete', confirmation: 'DELETE' }, { authorization: '' }, 401],
    [{ action: 'delete', confirmation: 'DELETE', user_id: 'someone-else' }, {}, 400],
    [{ action: 'delete', confirmation: 'DELETE', email: 'someone@example.test' }, {}, 400],
    [{ action: 'delete' }, {}, 400], ['broken-json', {}, 400], ['a'.repeat(12001), {}, 413],
  ]) {
    const h = await harness(); assert.equal((await h.request(body, headers)).status, expected); assert.equal(h.calls.length, 0);
  }
});
test('untrusted origins denied; approved CORS preflight cannot mutate data', async () => {
  const h = await harness();
  assert.equal((await h.request(undefined, { origin: 'https://egleze.com.attacker.test' })).status, 403);
  const cors = await h.request(undefined, { origin: 'capacitor://localhost' }, 'OPTIONS');
  assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), 'capacitor://localhost');
  assert.equal(h.calls.length, 0);
});
test('invalid, revoked or unverifiable sessions cannot reach service-role operations', async () => {
  for (const overrides of [{ userError: {} }, { active: false }, { sessionError: {} }]) {
    const h = await harness(overrides); assert.ok((await h.request()).status >= 400);
    assert.equal(h.calls.some(x => /deleteUser|signOut|credential/.test(x[0])), false);
  }
});
test('storage, Apple revocation and session revocation errors fail closed without deleting Auth user', async () => {
  for (const overrides of [{ rpcError: {} }, { credential: { refresh_token: 'secret' }, appleError: true }, { signOutError: {} }]) {
    const h = await harness(overrides); const response = await h.request();
    assert.equal(response.status, 503); assert.equal(response.body.deleted, undefined);
    assert.equal(JSON.stringify(response).includes('SECRET'), false);
    assert.equal(h.calls.some(x => x[0] === 'deleteUser'), false);
  }
});
test('failed Auth deletion is never reported as success and asks for a new session', async () => {
  const h = await harness({ deleteError: {} }); const result = await h.request();
  assert.equal(result.status, 503); assert.equal(result.body.sign_in_again, true); assert.equal(result.body.deleted, undefined);
});
test('older Apple accounts can be deleted with manual revocation instructions', async () => {
  const h = await harness({ appleUser: true });
  assert.equal((await h.request()).body.apple_access, 'manual_revocation_required');
  assert.equal(h.calls.at(-1)[0], 'deleteUser');
});
test('saved Apple access is revoked before sessions and account are removed', async () => {
  const h = await harness({ appleUser: true, credential: { refresh_token: 'secret', client_id: 'com.egleze.app.signin' } });
  assert.equal((await h.request()).body.apple_access, 'revoked');
  assert.deepEqual(h.calls.slice(-3).map(x => x[0]), ['revokeApple', 'signOut', 'deleteUser']);
});
test('Apple credential capture requires an Apple identity and verified provider token before vault storage', async () => {
  const body = { action: 'store-apple-credential', refresh_token: 'incoming' };
  const noApple = await harness(); assert.equal((await noApple.request(body)).status, 403);
  const invalid = await harness({ appleUser: true, appleError: true }); assert.equal((await invalid.request(body)).status, 503);
  assert.equal(invalid.calls.some(x => x[0] === 'egleze_store_apple_credential'), false);
  const valid = await harness({ appleUser: true }); assert.deepEqual((await valid.request(body)).body, { stored: true });
  assert.deepEqual(valid.calls.at(-1), ['egleze_store_apple_credential', { p_user_id: UID, p_token: 'verified-apple-token', p_client_id: 'com.egleze.app.signin' }]);
});

test('Apple service validates RSA-signed identity and generates a short-lived ES256 client secret', async t => {
  const { createAppleService } = await import('../supabase/functions/account-lifecycle/apple.mjs');
  const apple = await webcrypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const developer = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await webcrypto.subtle.exportKey('pkcs8', developer.privateKey)).toString('base64') + '\n-----END PRIVATE KEY-----';
  const jwk = { ...await webcrypto.subtle.exportKey('jwk', apple.publicKey), kid: 'apple-key', use: 'sig', alg: 'RS256' };
  const now = 2000000000;
  const baseClaims = { iss: 'https://appleid.apple.com', aud: 'com.egleze.app.signin', sub: 'apple-person', iat: now, exp: now + 3600 };
  async function token(claims, corrupt) {
    const input = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid })).toString('base64url') + '.' + Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', apple.privateKey, Buffer.from(input)));
    if (corrupt) signature[0] ^= 1;
    return input + '.' + signature.toString('base64url');
  }
  async function service(claims = baseClaims, corrupt = false, failRevoke = false) {
    const idToken = await token(claims, corrupt);
    const calls = [];
    return { calls, api: createAppleService({
      cryptoImpl: webcrypto, now: () => now * 1000,
      env: name => ({ SIWA_CLIENT_ID: baseClaims.aud, SIWA_TEAM_ID: 'TEAM', SIWA_KEY_ID: 'DEVELOPERKEY', SIWA_PRIVATE_KEY: pem })[name],
      fetchImpl: async (url, options = {}) => {
        calls.push(url);
        if (url.endsWith('/keys')) return Response.json({ keys: [jwk] });
        assert.equal(options.redirect, 'error');
        const jwt = options.body.get('client_secret').split('.');
        const header = JSON.parse(Buffer.from(jwt[0], 'base64url')); const body = JSON.parse(Buffer.from(jwt[1], 'base64url'));
        assert.equal(header.alg, 'ES256'); assert.equal(header.kid, 'DEVELOPERKEY');
        assert.equal(body.exp - body.iat, 300); assert.equal(body.sub, baseClaims.aud);
        assert.equal(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, developer.publicKey, Buffer.from(jwt[2], 'base64url'), Buffer.from(jwt.slice(0, 2).join('.'))), true);
        if (url.endsWith('/revoke')) { assert.equal(options.body.get('token_type_hint'), 'refresh_token'); return new Response('', { status: failRevoke ? 500 : 200 }); }
        assert.equal(options.body.get('grant_type'), 'refresh_token');
        return Response.json({ id_token: idToken, refresh_token: 'rotated-token' });
      },
    }) };
  }
  await t.test('accepts signed matching identity and preserves provider token rotation', async () => {
    const h = await service(); assert.deepEqual(await h.api.validate('input', ['apple-person']), { refreshToken: 'rotated-token', clientId: baseClaims.aud });
  });
  for (const [name, claims, corrupt] of [
    ['wrong account', { ...baseClaims, sub: 'other-person' }], ['wrong audience', { ...baseClaims, aud: 'other-client' }],
    ['wrong issuer', { ...baseClaims, iss: 'https://fake.test' }], ['expired token', { ...baseClaims, exp: now - 1 }],
    ['future token', { ...baseClaims, iat: now + 120 }], ['forged signature', baseClaims, true],
  ]) await t.test('rejects ' + name, async () => { const h = await service(claims, corrupt); await assert.rejects(h.api.validate('input', ['apple-person'])); });
  await t.test('revocation requires matching client and successful Apple response', async () => {
    const h = await service(); await assert.rejects(h.api.revoke({ client_id: 'other', refresh_token: 'input' })); assert.equal(h.calls.length, 0);
    await h.api.revoke({ client_id: baseClaims.aud, refresh_token: 'input' });
    const failed = await service(baseClaims, false, true); await assert.rejects(failed.api.revoke({ client_id: baseClaims.aud, refresh_token: 'input' }));
  });
});
