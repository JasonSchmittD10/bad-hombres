// One-time setup helper: turns a Yahoo authorization code into a refresh token.
//
// Yahoo redirects here with ?code=... and this exchanges it server-side using
// YAHOO_CLIENT_ID / YAHOO_CLIENT_SECRET, so the code never has to survive a
// copy-paste (they expire fast) and the client secret never touches a shell.
//
// Set YAHOO_CLIENT_ID and YAHOO_CLIENT_SECRET in Vercel first, then visit the
// authorize URL with redirect_uri pointing at this route.
//
// Once YAHOO_REFRESH_TOKEN is set, this route refuses to run.

// Hand-pasted env values pick up stray newlines from dashboard line wrapping.
const env = (name) => (process.env[name] || '').replace(/\s+/g, '');

const REDIRECT = env('YAHOO_REDIRECT_URI') || 'https://bad-hombres.vercel.app/api/yahoo-callback';

function page(title, bodyHtml) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
 body{background:#0d0d0f;color:#f4f5f7;font:15px/1.6 "Segoe UI",system-ui,sans-serif;margin:0;padding:40px 20px}
 .w{max-width:720px;margin:0 auto}
 h1{font-family:"Arial Black",Impact,sans-serif;text-transform:uppercase;font-size:22px}
 code,pre{background:#1e1e24;border:1px solid #2a2a31;border-radius:8px}
 code{padding:2px 6px}
 pre{padding:14px;overflow:auto;word-break:break-all;white-space:pre-wrap;color:#3fb26b}
 a{color:#c1121f}
 .warn{border-left:3px solid #c1121f;padding-left:14px;color:#9aa0aa}
</style><div class="w">${bodyHtml}</div>`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  // ?reauth=1 lets us re-issue a token in place (e.g. to add a missing scope)
  if (env('YAHOO_REFRESH_TOKEN') && req.query?.reauth !== '1' && !req.query?.code) {
    return res
      .status(410)
      .send(page('Setup already done', '<h1>Setup already done</h1><p>YAHOO_REFRESH_TOKEN is already set. This route is disabled. Unset it in Vercel if you genuinely need to re-issue a token.</p>'));
  }

  const id = env('YAHOO_CLIENT_ID'), secret = env('YAHOO_CLIENT_SECRET');
  if (!id || !secret) {
    return res
      .status(500)
      .send(page('Missing credentials', '<h1>Missing credentials</h1><p>Set <code>YAHOO_CLIENT_ID</code> and <code>YAHOO_CLIENT_SECRET</code> in Vercel, redeploy, then try the authorize URL again.</p>'));
  }

  const code = req.query?.code;
  if (!code) {
    const url =
      'https://api.login.yahoo.com/oauth2/request_auth?client_id=' +
      encodeURIComponent(id) +
      '&redirect_uri=' + encodeURIComponent(REDIRECT) +
      // No scope param: Yahoo rejects scope=fspt-r with invalid_scope. Fantasy
      // access is granted by the *app's* API Permissions, not by the request.
      // Without it the league call returns 401 additional_authorization_required.
      '&response_type=code&language=en-us';
    return res.status(200).send(
      page('Connect Yahoo', `<h1>Connect Yahoo</h1>
        <p>No <code>code</code> in the URL. Start the flow here:</p>
        <p><a href="${url}">Authorize with Yahoo →</a></p>
        <p class="warn">Sign in with the Yahoo account that is in league 97724.
        This exact redirect URI must be registered on the Yahoo app:<br>
        <code>${REDIRECT}</code></p>`)
    );
  }

  try {
    const r = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT,
        code: String(code),
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.refresh_token) {
      return res.status(502).send(
        page('Exchange failed', `<h1>Exchange failed</h1>
          <pre style="color:#ff6b76">${JSON.stringify(j, null, 2)}</pre>
          <p class="warn">If this says <code>invalid_grant</code>, the code was already used — start over from the authorize link.</p>`)
      );
    }
    return res.status(200).send(
      page('Refresh token', `<h1>Your refresh token</h1>
        <pre>${String(j.refresh_token).replace(/[<&]/g, '')}</pre>
        <p>Add it in Vercel as <code>YAHOO_REFRESH_TOKEN</code> (Production + Preview), then redeploy.</p>
        <p class="warn">Copy it now — this page will not show it again once the env var is set. Treat it like a password.</p>`)
    );
  } catch (err) {
    return res.status(502).send(page('Error', `<h1>Error</h1><pre style="color:#ff6b76">${String(err.message || err)}</pre>`));
  }
}
