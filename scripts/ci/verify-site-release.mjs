import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export function publicPath(file) {
  assert.ok(file.startsWith('site/') && !file.includes('..'));
  return '/' + file.slice(5).replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
}
export async function verifyLocal(commit) {
  assert.match(commit, /^[0-9a-f]{40}$/);
  const release = JSON.parse(await readFile('release.json', 'utf8'));
  assert.equal(release.version, 1);
  assert.equal(release.commit, commit);
  assert.equal(release.project, 'opentax');
  assert.equal(release.branch, 'main');
  assert.equal(release.origin, 'https://opentax.fragmentware.com');
  assert.equal(release.published.length, 53);
  assert.equal(new Set(release.published).size, 53);
  assert.deepEqual(release.held, ['blue-return-financial-statements-howto', 'etax-filing-sole-proprietor']);
  for (const [file, hash] of Object.entries(release.files)) {
    assert.ok(!file.startsWith('/') && !file.includes('..'), 'Unsafe artifact path');
    assert.equal(sha256(await readFile(file)), hash, 'Artifact mismatch: ' + file);
  }
  const actualSiteFiles = [];
  for (const file of await readdir('site', { recursive: true })) {
    const target = 'site/' + file;
    const info = await lstat(target);
    assert.ok(!info.isSymbolicLink(), 'Unexpected site symlink');
    if (info.isFile()) actualSiteFiles.push(target);
  }
  assert.deepEqual(actualSiteFiles.sort(), Object.keys(release.files).filter(file => file.startsWith('site/')).sort(), 'Unexpected or missing deployable files');
  console.log(`Verified local artifact for ${commit}.`);
  return release;
}
export async function verifyPublic(release) {
  const checks = Object.entries(release.files).filter(([file]) => file.startsWith('site/') && !['site/_headers', 'site/_redirects', 'site/404.html'].includes(file));
  const expected404 = release.files['site/404.html'];
  const deadline = Date.now() + 5 * 60 * 1000;
  let pending = checks.map(([file, hash]) => ({ url: release.origin + publicPath(file), hash, status: 200 }));
  pending.push(...release.held.map(slug => ({ url: release.origin + '/articles/' + slug, hash: expected404, status: 404 })));
  const total = pending.length;
  do {
    const failures = [];
    for (let start = 0; start < pending.length; start += 6) {
      await Promise.all(pending.slice(start, start + 6).map(async check => {
        try {
          const response = await fetch(check.url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
          assert.equal(response.status, check.status);
          if (check.status === 200) {
            assert.equal(response.url, check.url, 'Unexpected canonical redirect');
            assert.ok(!/noindex/i.test(response.headers.get('x-robots-tag') ?? ''));
          }
          assert.equal(sha256(Buffer.from(await response.arrayBuffer())), check.hash);
        } catch { failures.push(check); }
      }));
    }
    pending = failures;
    if (pending.length === 0) { console.log(`Verified ${total} public URLs against the build, including 53 articles and two held 404s.`); return; }
    if (Date.now() >= deadline) break;
    console.log(`Waiting for propagation of ${pending.length} URLs.`);
    await new Promise(resolve => setTimeout(resolve, 10000));
  } while (Date.now() < deadline);
  throw new Error('Public verification did not match the checked build: ' + pending.map(check => check.url).join(', '));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  assert.ok(['--local', '--public'].includes(mode));
  const release = await verifyLocal(process.argv[3]);
  if (mode === '--public') await verifyPublic(release);
}
