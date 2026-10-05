import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { buildArticles } from './articles.mjs';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const manifest = JSON.parse(await readFile(path.join(root, 'content/articles/manifest.json'), 'utf8'));
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

test('publication opens exactly 53 approved articles and preserves two held draft gates', async () => {
  assert.equal(manifest.length, 55);
  for (const article of manifest) {
    const held = ['57', '58'].includes(article.id);
    assert.equal(article.status, held ? 'draft' : 'published');
    assert.equal(article.publicationApproval, held ? 'pending' : 'approved');
    if (held) { assert.equal(article.publishedAt, null); assert.ok(article.reviewBlockers.length); }
    else { assert.equal(article.publishedAt, '2026-10-05'); assert.equal(article.reviewBlockers.length, 0); assert.equal(article.evidenceGaps.length, 0); }
  }
  assert.equal(sha256(await readFile(path.join(root, 'content/articles/freee-cost-review.md'))), '9904ec8c84741db045a277f043c3bfa4d9ea07d7eda71b182062db70516d51c2');
  for (const id of ['57', '58']) {
    const article = manifest.find((a) => a.id === id);
    assert.equal(article.verificationStatus, 'additional-evidence-needed'); assert.ok(article.evidenceGaps.length);
  }
});

test('rewritten HTML keeps answer flow, single sources, semantic schema and matching breadcrumbs', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'opentax-rewrite-'));
  try {
    await buildArticles({root,outDir,siteUrl:'https://opentax.fragmentware.com',preview:true});
    for (const article of manifest) {
      const html = await readFile(path.join(outDir, 'articles', article.slug + '.html'), 'utf8');
      assert.doesNotMatch(html, /class="article-summary"|\{#[a-z0-9-]+\}/);
      const order = ['class="article-toc"','class="article-prose"','class="article-cta"','class="article-sources"'].map((m) => html.indexOf(m));
      assert.ok(order.every((p,i) => p >= 0 && (!i || p > order[i-1])), article.slug);
      assert.equal((html.match(/id="sources"/g) || []).length, 1);
      assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
      const schema = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
      assert.equal(schema[0].headline, article.title); assert.equal(schema[0].description, article.description);
      assert.equal(schema[0].dateModified, article.updatedAt); assert.equal(schema[0].datePublished, article.publishedAt ?? undefined);
      if (article.representativeImage) assert.equal(schema[0].image, 'https://opentax.fragmentware.com' + article.representativeImage);
      else assert.equal(schema[0].image, undefined);
      assert.deepEqual(schema[1].itemListElement.map((c) => c.position), [1,2,3,4]);
      for (const crumb of schema[1].itemListElement) assert.ok(html.includes(crumb.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')));
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, article.slug);
      assert.match(html, /og:image:width/); assert.match(html, /og:image:alt/); assert.match(html, /twitter:image:alt/);
    }
    await buildArticles({root,outDir,siteUrl:'https://opentax.fragmentware.com'});
    const published = manifest.filter((article) => article.status === 'published');
    assert.equal(published.length, 53);
    assert.deepEqual((await readdir(path.join(outDir,'articles'))).sort(), ['index.html', 'category', ...published.map((article) => article.slug + '.html')].sort());
    for (const article of manifest.filter((article) => article.status === 'draft')) {
      await assert.rejects(readFile(path.join(outDir,'articles',article.slug + '.html')), {code:'ENOENT'});
      await assert.rejects(readdir(path.join(outDir,'article-assets',article.slug)), {code:'ENOENT'});
    }
  } finally { await rm(outDir,{recursive:true,force:true}); }
});
