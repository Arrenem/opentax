import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';

// The only credential handoff is loopback + same Origin + a per-session nonce. Nothing is written to disk.
export async function browserCredential({ sdk, mode = 'google', announce, timeoutMs = 300000, bundle }) {
  const nonce = randomBytes(32).toString('hex');
  let origin;
  const script = mode === 'google' ? await bundle(`
    import { initializeApp } from 'firebase/app';
    import { getAuth, GoogleAuthProvider, signInWithPopup, setPersistence, inMemoryPersistence } from 'firebase/auth';
    const auth = getAuth(initializeApp(${JSON.stringify(sdk).replaceAll('<', '\\u003c')}));
    document.querySelector('button').onclick = async () => {
      try { await setPersistence(auth, inMemoryPersistence); const provider = new GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
        const result = await signInWithPopup(auth, provider); const token = await result.user.getIdToken();
        await submit(token);
      } catch { document.querySelector('p').textContent = 'Sign-in failed. Retry or return to the terminal.'; }
    };
    async function submit(token) { const response = await fetch('/complete', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({nonce:${JSON.stringify(nonce)}, token})}); if (response.ok) document.body.textContent = 'Received. Return to the terminal; you may close this window.'; }
  `) : `document.querySelector('button').onclick = async () => { const input = document.querySelector('input'); const token=input.value; input.value=''; const response=await fetch('/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonce:${JSON.stringify(nonce)},token})}); if(response.ok) document.body.textContent='Received. Return to the terminal.'; };`;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, token) => { if (settled) return; settled = true; clearTimeout(timer); server.close(); server.closeAllConnections(); if (error) reject(error); else resolve(token); };
    const server = createServer(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'"); res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      if (req.headers.host !== new URL(origin).host) { res.writeHead(403).end(); return; }
      if (req.method === 'GET' && req.url === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>OpenTax setup sign-in</title><h1>OpenTax セットアップ</h1><p>${mode === 'google' ? '対象プロジェクトへGoogleでログインします。認証情報はメモリ内だけで扱います。' : 'OpenTax の Agent接続画面で別途同意して作成した read のみのトークンを入力してください。保存しません。'}</p>${mode === 'token' ? '<label>MCP token <input type="password" autocomplete="off"></label>' : ''}<button>${mode === 'google' ? 'Google でログイン' : '接続を検査'}</button><script src="/login.js"></script></html>`); return;
      }
      if (req.method === 'GET' && req.url === '/login.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(script); return; }
      if (req.method !== 'POST' || req.url !== '/complete' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') { res.writeHead(403).end(); return; }
      let body = '';
      try {
        for await (const data of req) { body += data; if (body.length > 16384) { res.writeHead(413).end(); return; } }
        const input = JSON.parse(body);
        if (input.nonce !== nonce || typeof input.token !== 'string' || !input.token || input.token.length > 12000 || /\s/.test(input.token)) { res.writeHead(403).end(); return; }
        res.on('finish', () => finish(null, input.token)); res.end('ok');
      } catch { res.writeHead(400).end(); }
    });
    const timer = setTimeout(() => finish(new Error('BROWSER_AUTH_TIMEOUT')), timeoutMs);
    server.on('error', () => finish(new Error('LOOPBACK_UNAVAILABLE')));
    server.listen(0, '127.0.0.1', () => { origin = `http://127.0.0.1:${server.address().port}`; announce(origin); });
  });
}

export async function validateGoogleIdentity(token, sdk, expectedEmail, fetcher = fetch) {
  const response = await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(sdk.apiKey)}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }) });
  if (!response.ok) throw new Error('OWNER_LOGIN_INVALID');
  const user = (await response.json()).users?.[0];
  if (!user?.localId || !user.emailVerified || user.disabled || !user.providerUserInfo?.some(p => p.providerId === 'google.com') || (expectedEmail && user.email?.toLowerCase() !== expectedEmail.toLowerCase())) throw new Error('OWNER_ACCOUNT_MISMATCH');
  return { uid: user.localId };
}
