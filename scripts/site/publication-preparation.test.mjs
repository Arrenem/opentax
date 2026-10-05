import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile, rm, readdir, stat } from 'node:fs/promises';
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

test('production has 53 indexable articles, six categories and no held draft content or broken local links', async () => {
  const outDir = path.join(root, 'site/dist');
  const manifest = JSON.parse(await readFile(path.join(root, 'content/articles/manifest.json'), 'utf8'));
  const published = manifest.filter(article => article.status === 'published');
  const held = manifest.filter(article => article.status === 'draft');
  assert.equal(published.length, 53);
  assert.deepEqual(held.map(article => article.id), ['57', '58']);
  const sitemap = await readFile(path.join(outDir, 'sitemap.xml'), 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.filter(url => /\/articles\/[^/]+$/.test(url)).length, 53);
  assert.equal(urls.filter(url => url.includes('/articles/category/')).length, 6);
  assert.match(await readFile(path.join(outDir, 'robots.txt'), 'utf8'), /Allow: \//);
  assert.doesNotMatch(await readFile(path.join(outDir, '_headers'), 'utf8'), /noindex/i);
  assert.match(await readFile(path.join(outDir, 'analytics-config.js'), 'utf8'), /G-HWFFMYR32H/);
  for (const draft of held) {
    assert.ok(!sitemap.includes(draft.slug));
    await assert.rejects(readFile(path.join(outDir, 'articles', draft.slug + '.html')), { code: 'ENOENT' });
    await assert.rejects(readdir(path.join(outDir, 'article-assets', draft.slug)), { code: 'ENOENT' });
  }
  const files = (await readdir(outDir, { recursive: true })).filter(file => file.endsWith('.html'));
  for (const file of files) {
    const html = await readFile(path.join(outDir, file), 'utf8');
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/i, file);
    for (const draft of held) assert.ok(!html.includes('/articles/' + draft.slug), file);
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (file !== '404.html') assert.ok(canonical && canonical[1].startsWith('https://opentax.fragmentware.com/'), file);
    const baseUrl = canonical?.[1] ?? 'https://opentax.fragmentware.com/404';
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const href = match[1].replaceAll('&amp;', '&');
      if (/^mailto:|^data:/.test(href)) continue;
      const url = new URL(href, baseUrl);
      if (url.origin !== 'https://opentax.fragmentware.com') continue;
      const pathname = decodeURIComponent(url.pathname);
      const candidates = [path.join(outDir, pathname), path.join(outDir, pathname + '.html'), path.join(outDir, pathname, 'index.html')];
      let target;
      for (const candidate of candidates) {
        try { if ((await stat(candidate)).isFile()) { target = candidate; break; } } catch { /* try next */ }
      }
      assert.ok(target, file + ': missing local target ' + href);
      if (url.hash && target.endsWith('.html')) {
        const targetHtml = await readFile(target, 'utf8');
        assert.ok(targetHtml.includes('id="' + decodeURIComponent(url.hash.slice(1)) + '"'), file + ': missing anchor ' + href);
      }
    }
  }
});
