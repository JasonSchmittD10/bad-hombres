// Shared Yahoo plumbing for the /api functions: auth, the request helper, and the two
// helpers for Yahoo's nested JSON. Files starting with "_" aren't routes on Vercel.
//
// Env (Vercel → Settings → Environment Variables): YAHOO_CLIENT_ID,
// YAHOO_CLIENT_SECRET, YAHOO_REFRESH_TOKEN; optional YAHOO_LEAGUE_ID (97724),
// YAHOO_REDIRECT_URI. Secrets never live in this repo.

// Env values are pasted by hand into a dashboard, where line wrapping loves to
// smuggle in newlines. None of these values legitimately contain whitespace.
export const env = (name) => (process.env[name] || '').replace(/\s+/g, '');

export const LEAGUE_ID = env('YAHOO_LEAGUE_ID') || '97724';
export const LEAGUE_KEY = `nfl.l.${LEAGUE_ID}`;
const Y = 'https://fantasysports.yahooapis.com/fantasy/v2';

/* ---------------- Yahoo auth ---------------- */

let tokenCache = { token: null, exp: 0 };

export async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const id = env('YAHOO_CLIENT_ID'),
        secret = env('YAHOO_CLIENT_SECRET'),
        refresh = env('YAHOO_REFRESH_TOKEN');
  if (!id || !secret || !refresh) throw new Error('missing-yahoo-env');

  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      // Must match the Redirect URI registered on the Yahoo app. Yahoo no
      // longer accepts the old 'oob' value, so this defaults to the site.
      redirect_uri: env('YAHOO_REDIRECT_URI') || 'https://bad-hombres.vercel.app/',
      refresh_token: refresh,
    }),
  });
  if (!res.ok) throw new Error(`yahoo-token-${res.status}`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return tokenCache.token;
}

export async function yahoo(path) {
  const t = await accessToken();
  const res = await fetch(`${Y}${path}${path.includes('?') ? '&' : '?'}format=json`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`yahoo-${res.status}-${path} ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ---------------- Yahoo JSON is a maze ----------------
   Collections arrive as {0:{...},1:{...},count:n} and each element is often
   an array of partial objects. flat() turns any of that into a plain array,
   merge() squashes the array-of-fragments into one object.               */

export function flat(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  const out = [];
  for (const k of Object.keys(node)) {
    if (k === 'count') continue;
    if (/^\d+$/.test(k)) out.push(node[k]);
  }
  return out;
}

export function merge(node) {
  if (!node) return {};
  if (!Array.isArray(node)) return node;
  const out = {};
  for (const part of node) {
    if (!part || typeof part !== 'object') continue;
    if (Array.isArray(part)) Object.assign(out, merge(part));
    else Object.assign(out, part);
  }
  return out;
}
