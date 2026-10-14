import test from 'node:test';
import assert from 'node:assert/strict';
import { browserCredential } from './browser.mjs';
test('loopback handoff rejects wrong origin/nonce and accepts one in-memory credential', async () => {
  let assertions;
  const token = await browserCredential({ mode: 'token', timeoutMs: 5000, announce: origin => {
    assertions = (async () => {
      const page = await fetch(origin);
      assert.equal(page.headers.get('cache-control'), 'no-store');
      const script = await (await fetch(`${origin}/login.js`)).text();
      const nonce = script.match(/nonce:"([0-9a-f]+)"/)[1];
      const post = (originHeader, nonceValue, credential = 'test-token') => fetch(`${origin}/complete`, { method: 'POST', headers: { Origin: originHeader, 'Content-Type': 'application/json' }, body: JSON.stringify({ nonce: nonceValue, token: credential }) });
      assert.equal((await post('https://attacker.example', nonce)).status, 403);
      assert.equal((await post(origin, 'wrong')).status, 403);
      assert.equal((await post(origin, nonce, 'token with space')).status, 403);
      assert.equal((await post(origin, nonce)).status, 200);
    })();
  } });
  await assertions; assert.equal(token, 'test-token');
});
