import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// These SHA-256 values were compared with the production assets on 2026-10-02.
// The restored three-scene mock, GA privacy gate, and Privacy source are immutable
// for this article-only change. Update intentionally if those features change later.
const hashes = {
  'main.js': '184760e8d0acdcad4afe7969518f6a7705f37fef1cde1a595dd052023551cdac',
  'styles.css': 'a36331718d468f6c352d376ab4f22b73fd02d6b2cc4edd18e25da21343367ca5',
  'analytics.js': 'd5387657d9d808cdddb6ac5f68eebe6befc0cba1072137d593a8d0665ae4a6ac',
  'privacy.html': 'a30ab5fa761b3b2c94bddaf4110a225624ce57f2f1cfaa23d6b607f9b998fc44',
};
const sha = (value) => createHash('sha256').update(value).digest('hex');
test('restored production mock, GA and Privacy remain unchanged', async () => {
  for (const [file, expected] of Object.entries(hashes)) {
    assert.equal(sha(await readFile(new URL('../site/' + file, import.meta.url))), expected, file);
  }
});
test('LP changes only add two article navigation links', async () => {
  const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/href="\/articles\/"/g) || []).length, 2);
  const original = html.replace(/^\s*<a href="\/articles\/">会計記事<\/a>\n/gm, '');
  assert.equal(sha(original), 'cfc3ea7b054e1bf231a0b6c8882f4ae978c4b72216614c707fddeca6703195db');
});
