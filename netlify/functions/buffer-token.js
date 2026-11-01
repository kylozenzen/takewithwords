// Take With Words — standalone Buffer OAuth token exchange (public PKCE client).
// Exchanges an authorization code (or refresh token) for Buffer tokens. There is
// no client secret: the public client id is sent with each request. Self-contained
// so no environment variables are required — it allows its own site origin and
// localhost by default. (You may still set BUFFER_ALLOWED_ORIGINS to add more.)

const DEFAULT_ALLOWED = ['https://takewithwords.netlify.app'];

function isLocal(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}
function siteOrigins() {
  const out = [];
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].forEach(function (u) {
    if (u) { try { out.push(new URL(u).origin); } catch (e) {} }
  });
  return out;
}
function allowedOrigin(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!origin) return null;
  const extra = (process.env.BUFFER_ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  const list = DEFAULT_ALLOWED.concat(siteOrigins()).concat(extra);
  if (isLocal(origin) || list.indexOf(origin) !== -1) return origin;
  return null;
}
function corsHeaders(event) {
  const origin = allowedOrigin(event);
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return { headers: headers, allowed: origin !== null };
}
async function fetchWithTimeout(url, opts, ms) {
  const ctrl = new AbortController();
  const id = setTimeout(function () { ctrl.abort(); }, ms || 10000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); }
  finally { clearTimeout(id); }
}

exports.handler = async function handler(event) {
  const cors = corsHeaders(event);
  const headers = cors.headers;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (!cors.allowed) return { statusCode: 403, headers: headers, body: JSON.stringify({ error: 'origin_not_allowed' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'method_not_allowed' }) };

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'invalid_json' }) }; }

  const clientId = String(payload.client_id || '').trim();
  if (!clientId) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'missing_client_id' }) };

  const grantType = payload.grant_type === 'refresh_token' ? 'refresh_token' : 'authorization_code';
  let params;
  if (grantType === 'refresh_token') {
    const refresh_token = String(payload.refresh_token || '').trim();
    if (!refresh_token) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'missing_refresh_token' }) };
    params = new URLSearchParams({ client_id: clientId, grant_type: 'refresh_token', refresh_token: refresh_token });
  } else {
    const code = String(payload.code || '').trim();
    const redirect_uri = String(payload.redirect_uri || '').trim();
    const code_verifier = String(payload.code_verifier || '').trim();
    if (!code || !redirect_uri || !code_verifier) {
      return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'missing_required_fields', required: ['code', 'redirect_uri', 'code_verifier'] }) };
    }
    params = new URLSearchParams({ client_id: clientId, grant_type: 'authorization_code', code: code, redirect_uri: redirect_uri, code_verifier: code_verifier });
  }

  try {
    const res = await fetchWithTimeout('https://auth.buffer.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: 'invalid_buffer_response', raw: text }; }
    return { statusCode: res.status, headers: headers, body: JSON.stringify(data) };
  } catch (err) {
    const isAbort = err && err.name === 'AbortError';
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: isAbort ? 'buffer_timeout' : 'buffer_request_failed' }) };
  }
};
