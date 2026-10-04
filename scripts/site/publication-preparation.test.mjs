import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildArticles } from './articles.mjs';
const root = process.cwd();
test('53 candidate articles build together without linking to the two held drafts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'opentax-partial-publication-'));
  try {
    await cp(path.join(root, 'content'), path.join(temp, 'content'), { recursive: true });
    await cp(path.join(root, 'site'), path.join(temp, 'site'), { recursive: true });
    const filename = path.join(temp, 'content/articles/manifest.json');
    const manifest = JSON.parse(await readFile(filename, 'utf8'));
    const held = manifest.filter(a => ['57', '58'].includes(a.id));
    const candidates = manifest.filter(a => !held.includes(a));
    assert.equal(candidates.length, 53);
    for (const article of candidates) Object.assign(article, { status: 'published', publicationApproval: 'approved', publishedAt: '2026-10-04', updatedAt: '2026-10-04', reviewedAt: '2026-10-04', reviewBlockers: [] });
    await writeFile(filename, JSON.stringify(manifest));
    const outDir = path.join(temp, 'output');
    const entries = await buildArticles({ root: temp, outDir, siteUrl: 'https://opentax.fragmentware.com' });
    assert.equal(entries.filter(e => candidates.some(a => e.path.endsWith('/articles/' + a.slug))).length, 53);
    for (const article of candidates) {
      const html = await readFile(path.join(outDir, 'articles', article.slug + '.html'), 'utf8');
      for (const draft of held) assert.ok(!html.includes('/articles/' + draft.slug), article.slug + ' links to ' + draft.slug);
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});
test('tax review records identify AI review and bind evidence to the current article body', async () => {
  const { createHash } = await import('node:crypto');
  const records = JSON.parse(await readFile(path.join(root, 'content/articles/publication-tax-review-2026-10-04.json'), 'utf8'));
  assert.deepEqual(records.map(r => r.articleId), ['46', '49', '52', '53', '54', '56']);
  for (const record of records) {
    assert.equal(record.professionalSupervision, false);
    assert.match(record.performedBy, /AI/);
    const body = await readFile(path.join(root, 'content/articles', record.slug + '.md'));
    assert.equal(record.reviewedBodySha256, createHash('sha256').update(body).digest('hex'));
    for (const file of record.implementationEvidence) await readFile(path.join(root, file));
  }
});
