import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildArticles } from './site/articles.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const articles = JSON.parse(await readFile(path.join(root, 'content/articles/manifest.json'), 'utf8'));
const expected = Array.from({ length: 58 }, (_, n) => String(n + 1).padStart(2, '0')).filter((id) => !['04', '12', '40'].includes(id));
test('all 55 distinct sole-proprietor articles have practical bodies and review state', async () => {
  assert.deepEqual(articles.map((a) => a.id).sort(), expected);
  assert.equal(articles.filter((a) => a.category === 'how-to' && a.articleType === 'howto').length, 18);
  for (const article of articles) {
    const body = await readFile(path.join(root, article.sourcePath), 'utf8');
    assert.ok(body.length >= 1000, article.slug + ': body is too short');
    assert.ok((body.match(/^## /gm) || []).length >= 3, article.slug + ': missing practical sections');
    assert.equal(article.audience, 'sole-proprietor');
    assert.ok(article.sources.length, article.slug + ': no sources');
    if (article.status === 'draft') assert.ok(article.reviewBlockers.length, article.slug + ': unexplained draft');
    if (article.productPlacement === 'end-only') {
      const positions = [...body.matchAll(/OpenTax/gi)].map((m) => m.index);
      assert.ok(positions.every((n) => n > body.length * 0.65), article.slug + ': product promotion precedes the answer');
    }
  }
});
test('all preview pages have valid metadata, reachable internal links and TOC anchors', async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'opentax-content-links-'));
  try {
    await cp(path.join(root, 'site/dist'), outDir, { recursive: true });
    await buildArticles({ root, outDir, siteUrl: 'https://opentax.fragmentware.com', preview: true });
    for (const article of articles) {
      const file = path.join(outDir, 'articles', article.slug + '.html');
      const html = await readFile(file, 'utf8');
      assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, article.slug);
      assert.match(html, /noindex/);
      assert.match(html, new RegExp('https://opentax\\.fragmentware\\.com/articles/' + article.slug));
      for (const schema of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        const data = JSON.parse(schema[1]);
        assert.equal(data['@graph'][0].mainEntityOfPage, 'https://opentax.fragmentware.com/articles/' + article.slug);
      }
      for (const link of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const href = link[1].replaceAll('&amp;', '&');
        if (/^https?:|^mailto:/.test(href)) continue;
        const url = new URL(href, 'https://opentax.fragmentware.com/articles/' + article.slug);
        const pathname = decodeURIComponent(url.pathname);
        const candidates = pathname === '/' ? [path.join(outDir, 'index.html')] : [
          path.join(outDir, pathname), path.join(outDir, pathname + '.html'), path.join(outDir, pathname, 'index.html'),
        ];
        let target;
        for (const candidate of candidates) {
          try { if ((await stat(candidate)).isFile()) { target = candidate; break; } } catch { /* next candidate */ }
        }
        assert.ok(target, article.slug + ': missing link ' + href);
        if (url.hash && target.endsWith('.html')) {
          const targetHtml = await readFile(target, 'utf8');
          const anchor = decodeURIComponent(url.hash.slice(1));
          assert.ok(targetHtml.includes('id="' + anchor + '"'), article.slug + ': missing anchor ' + href);
        }
      }
    }
  } finally { await rm(outDir, { recursive: true, force: true }); }
});
