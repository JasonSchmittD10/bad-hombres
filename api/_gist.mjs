// The league's free storage: one secret GitHub Gist, one JSON file per use (the pick'em,
// the win-probability pulse). Env: PICKS_GIST_ID and PICKS_GIST_TOKEN (a classic token
// with only the "gist" scope). A PATCH only touches the file it names, so the files
// don't disturb each other. Files starting with "_" aren't routes on Vercel.

const env = (n) => (process.env[n] || '').trim();
const GIST = env('PICKS_GIST_ID');
const TOKEN = env('PICKS_GIST_TOKEN');

export const storageReady = () => Boolean(GIST && TOKEN);

const GH = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'bad-hombres-site',
};

// the file's parsed JSON, or null if the gist doesn't have it yet
export async function readFile(name) {
  const r = await fetch(`https://api.github.com/gists/${GIST}`, { headers: GH, cache: 'no-store' });
  if (!r.ok) throw new Error(`storage-${r.status}`);
  const f = ((await r.json()).files || {})[name];
  if (!f) return null;
  // a big file comes back truncated; fetch the raw copy instead
  const text = f.truncated ? await (await fetch(f.raw_url, { headers: GH })).text() : f.content;
  return JSON.parse(text || 'null');
}

export async function writeFile(name, data, pretty = true) {
  const r = await fetch(`https://api.github.com/gists/${GIST}`, {
    method: 'PATCH',
    headers: { ...GH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [name]: { content: JSON.stringify(data, null, pretty ? 1 : 0) } } }),
  });
  if (!r.ok) throw new Error(`storage-save-${r.status}`);
}
