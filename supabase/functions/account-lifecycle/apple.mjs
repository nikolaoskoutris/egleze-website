const ISSUER = 'https://appleid.apple.com';
const encoder = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const encode = value => b64url(encoder.encode(JSON.stringify(value)));

export function createAppleService({ env, fetchImpl = fetch, cryptoImpl = crypto, now = () => Date.now() }) {
  function config() {
    const clientId = env('SIWA_CLIENT_ID');
    const teamId = env('SIWA_TEAM_ID');
    const keyId = env('SIWA_KEY_ID');
    const pem = env('SIWA_PRIVATE_KEY');
    if (!clientId || !teamId || !keyId || !pem) throw new Error('apple_configuration_missing');
    return { clientId, teamId, keyId, pem };
  }
  async function clientSecret(c) {
    const seconds = Math.floor(now() / 1000);
    const signingInput = encode({ alg: 'ES256', kid: c.keyId }) + '.' + encode({ iss: c.teamId, iat: seconds, exp: seconds + 300, aud: ISSUER, sub: c.clientId });
    const bytes = unb64(c.pem.replace(/-----[A-Z ]+-----|\s/g, ''));
    const key = await cryptoImpl.subtle.importKey('pkcs8', bytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const signature = await cryptoImpl.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(signingInput));
    return signingInput + '.' + b64url(signature);
  }
  async function post(path, values) {
    return fetchImpl(ISSUER + path, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values),
    });
  }
  async function verifyIdentity(token, clientId, subjects) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('apple_identity_invalid');
    const header = JSON.parse(new TextDecoder().decode(unb64(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(unb64(parts[1])));
    const seconds = Math.floor(now() / 1000);
    if (header.alg !== 'RS256' || !header.kid || claims.iss !== ISSUER ||
        claims.aud !== clientId || !subjects.includes(claims.sub) ||
        typeof claims.exp !== 'number' || claims.exp <= seconds ||
        typeof claims.iat !== 'number' || claims.iat > seconds + 60) throw new Error('apple_identity_invalid');
    const response = await fetchImpl(ISSUER + '/auth/keys', { redirect: 'error', signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('apple_keys_unavailable');
    const { keys } = await response.json();
    const jwk = keys?.find(k => k.kid === header.kid && k.kty === 'RSA' && k.alg === 'RS256' && k.use === 'sig');
    if (!jwk) throw new Error('apple_identity_invalid');
    const key = await cryptoImpl.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await cryptoImpl.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(parts[2]), encoder.encode(parts[0] + '.' + parts[1]))) throw new Error('apple_identity_invalid');
  }
  return {
    async validate(refreshToken, subjects) {
      const c = config();
      const response = await post('/auth/token', { client_id: c.clientId, client_secret: await clientSecret(c), grant_type: 'refresh_token', refresh_token: refreshToken });
      if (!response.ok) throw new Error('apple_refresh_invalid');
      const data = await response.json();
      await verifyIdentity(data.id_token, c.clientId, subjects);
      return { refreshToken: data.refresh_token || refreshToken, clientId: c.clientId };
    },
    async revoke(credential) {
      const c = config();
      if (credential.client_id !== c.clientId) throw new Error('apple_client_mismatch');
      const response = await post('/auth/revoke', { client_id: c.clientId, client_secret: await clientSecret(c), token: credential.refresh_token, token_type_hint: 'refresh_token' });
      if (!response.ok) throw new Error('apple_revocation_failed');
    },
  };
}
