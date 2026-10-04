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

test('rewrite preserves all 55 draft gates and the approved baseline body', async () => {
  assert.equal(manifest.length, 55);
  for (const article of manifest) {
    assert.equal(article.status, 'draft'); assert.equal(article.publicationApproval, 'pending');
    assert.equal(article.publishedAt, null); assert.ok(article.reviewBlockers.length);
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
      assert.equal(schema[0].dateModified, article.updatedAt); assert.equal(schema[0].datePublished, undefined);
      if (article.representativeImage) assert.equal(schema[0].image, 'https://opentax.fragmentware.com' + article.representativeImage);
      else assert.equal(schema[0].image, undefined);
      assert.deepEqual(schema[1].itemListElement.map((c) => c.position), [1,2,3,4]);
      for (const crumb of schema[1].itemListElement) assert.ok(html.includes(crumb.name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')));
      const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, article.slug);
      assert.match(html, /og:image:width/); assert.match(html, /og:image:alt/); assert.match(html, /twitter:image:alt/);
    }
    await buildArticles({root,outDir,siteUrl:'https://opentax.fragmentware.com'});
    assert.deepEqual(await readdir(path.join(outDir,'articles')), ['index.html']);
    await assert.rejects(readdir(path.join(outDir,'article-assets')), {code:'ENOENT'});
  } finally { await rm(outDir,{recursive:true,force:true}); }
});
