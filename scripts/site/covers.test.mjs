import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = file => readFile(path.join(root, file));
const json = async file => JSON.parse(await read(file));
const articles = await json('content/articles/manifest.json');
const { covers } = await json('content/articles/covers.json');
const photos = await json('content/articles/cover-photos.json');
const visuals = await json('content/articles/visual-assets.json');

test('all 54 non-benchmark covers use short titles, registered photos and matching list/OG/schema references', async () => {
  const target = articles.filter(article => article.slug !== 'freee-cost-review');
  assert.deepEqual(Object.keys(covers).sort(), target.map(article => article.slug).sort());
  assert.equal(target.length, 54);
  assert.equal(new Set(Object.values(covers).map(cover => cover.photo)).size, 5);
  const hashes = new Set();
  for (const article of target) {
    const cover = covers[article.slug];
    assert.equal(cover.titleLines.length, 2);
    assert.ok(cover.titleLines.every(line => line && !/[\n\r]/.test(line)));
    assert.equal(article.thumbnailTitle, cover.titleLines.join('\n'));
    assert.equal(article.thumbnailImage, article.socialImage);
    assert.equal(article.representativeImage, article.socialImage);
    const image = article.images.find(image => image.path === article.socialImage);
    assert.equal(image.kind, 'cover');
    assert.equal(image.alt, cover.titleLines.join(' '));
    assert.equal(image.width, 1200); assert.equal(image.height, 630);
    assert.equal(image.credit, photos[cover.photo].credit);
    assert.equal(image.sourceUrl, photos[cover.photo].sourceUrl);
    assert.equal(image.licenseUrl, 'https://unsplash.com/license');
    const bytes = await read('site' + image.path);
    assert.equal(bytes.readUInt16BE(0), 0xffd8, 'JPEG cover');
    assert.ok(bytes.length < 150000, article.slug + ': cover too heavy');
    hashes.add(createHash('sha256').update(bytes).digest('hex'));
    assert.equal(visuals[article.slug].share.src, image.path);
    assert.equal(visuals[article.slug].share.kind, 'cover');
    assert.equal(visuals[article.slug].share.provenance.sourcePhotoSha256, photos[cover.photo].sha256);
    assert.ok(article.visualInsertions.every(insertion => insertion.path.endsWith('/guide.svg')));
    assert.ok(article.images.some(image => image.kind === 'guide'));
  }
  assert.equal(hashes.size, 54, 'Every article has its own cover');
});

test('original photo provenance is complete and source bytes remain pinned', async () => {
  for (const photo of Object.values(photos)) {
    assert.equal(createHash('sha256').update(await read(photo.path)).digest('hex'), photo.sha256);
    assert.match(photo.sourceUrl, /^https:\/\/unsplash.com\/photos\//);
    assert.equal(photo.licenseName, 'Unsplash License');
    assert.match(photo.credit, / \/ Unsplash$/);
    assert.match(photo.accessedAt, /^2026-10-0[25]$/);
  }
});

test('benchmark card stays photographic; covers use its 16:9 shape without article diagrams', async () => {
  const benchmark = articles.find(article => article.slug === 'freee-cost-review');
  assert.equal(benchmark.thumbnailImage, undefined);
  assert.equal(benchmark.representativeImage, '/article-assets/freee-cost-review/calculator.jpg');
  assert.equal(benchmark.thumbnailTitle, 'freee、もっと安く。\nプランと払い方を見直す');
  const index = (await read('site/dist/articles/index.html')).toString();
  assert.equal((index.match(/article-thumbnail--cover/g) || []).length, 52);
  assert.doesNotMatch(index, /article-thumbnail--diagram|src="[^\"]+\/guide\.svg"/);
  for (const article of articles.filter(article => article.status === 'published' && article.slug !== benchmark.slug)) {
    const page = (await read(`site/dist/articles/${article.slug}.html`)).toString();
    assert.ok(page.includes(`property="og:image" content="https://opentax.fragmentware.com${article.socialImage}"`));
    assert.ok(page.includes(`src="/article-assets/${article.slug}/guide.svg"`));
  }
  const css = (await read('site/articles.css')).toString();
  assert.match(css, /\.article-thumbnail--cover\{padding:0;aspect-ratio:16\/9/);
});

test('body-diagram regeneration cannot restore the old table-like share image', async () => {
  const generator = (await read('scripts/site/generate-article-visuals.py')).toString();
  assert.doesNotMatch(generator, /def share\(|social\.png\(/);
  assert.match(generator, /retained_share/);
});
