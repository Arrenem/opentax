import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const heldIds = ['57', '58'];
export function checkPublication(articles) {
  assert.equal(articles.length, 55, 'Expected the reviewed 55-article registry');
  const expectedIds = Array.from({ length: 58 }, (_, index) => String(index + 1).padStart(2, '0')).filter(id => !['04', '12', '40'].includes(id));
  assert.deepEqual(articles.map(article => article.id).sort(), expectedIds, 'Do not replace reviewed article identities');
  assert.equal(new Set(articles.map(article => article.slug)).size, articles.length);
  const published = articles.filter(article => article.status === 'published');
  const held = articles.filter(article => article.status === 'draft');
  assert.equal(published.length, 53, 'Exactly 53 articles are approved');
  assert.deepEqual(held.map(article => article.id), heldIds, 'Keep articles 57 and 58 unpublished');
  for (const article of published) {
    assert.equal(article.publicationApproval, 'approved');
    assert.deepEqual(article.evidenceGaps, []);
    assert.deepEqual(article.reviewBlockers, []);
  }
  for (const article of held) {
    assert.equal(article.publicationApproval, 'pending');
    assert.equal(article.publishedAt, null);
    assert.ok(article.evidenceGaps.length > 0);
  }
  return { published: published.map(article => article.slug), held: held.map(article => article.slug) };
}

export async function prepareRelease(root, output, commit) {
  assert.match(commit, /^[0-9a-f]{40}$/, 'Expected an immutable Git commit SHA');
  const publication = checkPublication(JSON.parse(await readFile(path.join(root, 'content/articles/manifest.json'), 'utf8')));
  await mkdir(output, { recursive: true });
  await cp(path.join(root, 'site/dist'), path.join(output, 'site'), { recursive: true });
  await mkdir(path.join(output, 'tools/pages-deploy'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json']) await cp(path.join(root, 'tools/pages-deploy', file), path.join(output, 'tools/pages-deploy', file));
  await cp(path.join(root, 'scripts/ci/verify-site-release.mjs'), path.join(output, 'verify-site-release.mjs'));
  const files = {};
  for (const file of (await readdir(output, { recursive: true })).sort()) {
    const entry = path.join(output, file);
    const info = await lstat(entry);
    assert.ok(!info.isSymbolicLink(), 'No symlinks in release: ' + file);
    if (!info.isFile()) continue;
    assert.ok(!/(^|\/)\.(?:env|git)|(^|\/)(?:_worker(?:\.js|\.bundle)?|functions)(?:\/|$)/.test(file), 'Forbidden deployment file: ' + file);
    files[file] = createHash('sha256').update(await readFile(entry)).digest('hex');
  }
  for (const slug of publication.published) assert.ok(files['site/articles/' + slug + '.html']);
  for (const slug of publication.held) assert.ok(!Object.keys(files).some(file => file.startsWith('site/article-assets/' + slug + '/') || file === 'site/articles/' + slug + '.html'));
  const release = { version: 1, commit, project: 'opentax', branch: 'main', origin: 'https://opentax.fragmentware.com', ...publication, files };
  await writeFile(path.join(output, 'release.json'), JSON.stringify(release, null, 2) + '\n');
  console.log(`Prepared ${publication.published.length} published articles, ${publication.held.length} held drafts, ${Object.keys(files).length} checked files for ${commit}.`);
  return release;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await prepareRelease(process.cwd(), path.resolve(process.argv[2]), process.argv[3]);
