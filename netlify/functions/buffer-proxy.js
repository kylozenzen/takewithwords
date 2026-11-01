// Take With Words — standalone Buffer GraphQL proxy.
// Forwards {token, query, variables} to Buffer's API with the bearer token,
// so the access token is sent server-side. Self-contained CORS: allows its own
// site origin and localhost by default (no environment variables required).

const DEFAULT_ALLOWED = ['https://takewithwords.netlify.app'];
const MAX_QUERY = 50000;

function isLocal(o) { return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o); }
function siteOrigins() {
  var out = [];
  [process.env.URL, process.env.DEPLOY_PRIME_URL, process.env.DEPLOY_URL].forEach(function (u) { if (u) { try { out.push(new URL(u).origin); } catch (e) {} } });
  return out;
}
function allowedOrigin(event) {
  var origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  if (!origin) return null;
  var extra = (process.env.BUFFER_ALLOWED_ORIGINS || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var list = DEFAULT_ALLOWED.concat(siteOrigins()).concat(extra);
  if (isLocal(origin) || list.indexOf(origin) !== -1) return origin;
  return null;
}
function cors(event) {
  var origin = allowedOrigin(event);
  var headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  return { headers: headers, allowed: origin !== null };
}
async function fetchWithTimeout(url, opts, ms) {
  var ctrl = new AbortController(); var id = setTimeout(function () { ctrl.abort(); }, ms || 15000);
  try { return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal })); } finally { clearTimeout(id); }
}

exports.handler = async function handler(event) {
  var c = cors(event); var headers = c.headers;
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: headers, body: '' };
  if (!c.allowed) return { statusCode: 403, headers: headers, body: JSON.stringify({ error: 'origin_not_allowed' }) };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: headers, body: JSON.stringify({ error: 'method_not_allowed' }) };

  var payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'invalid_json' }) }; }
  var query = payload.query, variables = payload.variables || {}, token = payload.token;
  if (typeof query !== 'string' || !query.trim()) return { statusCode: 400, headers: headers, body: JSON.stringify({ error: 'no_query' }) };
  if (query.length > MAX_QUERY) return { statusCode: 413, headers: headers, body: JSON.stringify({ error: 'query_too_large' }) };
  if (!token) return { statusCode: 401, headers: headers, body: JSON.stringify({ error: 'missing_token' }) };

  try {
    var res = await fetchWithTimeout('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ query: query, variables: variables }),
    });
    var text = await res.text(); var data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { return { statusCode: res.status >= 500 ? res.status : 502, headers: headers, body: JSON.stringify({ error: 'buffer_non_json', status: res.status }) }; }
    return { statusCode: res.status, headers: headers, body: JSON.stringify(data) };
  } catch (err) {
    var isAbort = err && err.name === 'AbortError';
    return { statusCode: 502, headers: headers, body: JSON.stringify({ error: isAbort ? 'buffer_timeout' : 'buffer_request_failed' }) };
  }
};
