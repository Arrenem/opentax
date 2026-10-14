import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('Firebase Admin CommonJS runtime', () => {
  it('loads auth and converts a signing key without native ESM require support', () => {
    const script = `
      const assert = require('node:assert/strict');
      const { generateKeyPairSync } = require('node:crypto');
      require('firebase-admin/auth');
      const { retrieveSigningKeys } = require('jwks-rsa/src/utils');
      const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig' };
      retrieveSigningKeys([jwk]).then((keys) => {
        assert.equal(keys.length, 1);
        assert.match(keys[0].getPublicKey(), /BEGIN PUBLIC KEY/);
      }).catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const result = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', script], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
  });
});
