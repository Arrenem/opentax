import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const load = async (name) => JSON.parse(await readFile(new URL('../../content/articles/' + name, import.meta.url), 'utf8'));
test('shared official pricing records are all used and calculated amounts agree', async () => {
  const records = await load('pricing.json');
  const articles = await load('manifest.json');
  const used = new Set();
  assert.equal(records.length, 30);
  assert.equal(new Set(records.map((r) => r.id)).size, records.length);
  for (const article of articles) {
    const markdown = await readFile(new URL('../../' + article.sourcePath, import.meta.url), 'utf8');
    for (const ref of markdown.matchAll(/\{\{pricing:([a-z0-9-]+):([a-zA-Z0-9_]+)\}\}/g)) {
      const record = records.find((r) => r.id === ref[1]);
      assert.ok(record, ref[1]);
      assert.ok(['number', 'string'].includes(typeof record[ref[2]]), ref[0]);
      assert.ok(article.pricingRefs.includes(ref[1]), article.slug + ': missing pricingRefs');
      used.add(ref[1]);
    }
  }
  assert.equal(used.size, records.length);
  for (const record of records) {
    assert.equal(record.verified, true);
    assert.equal(record.audience, 'sole-proprietor');
    assert.equal(record.currency, 'JPY');
    if (record.amountExclTax !== null) {
      assert.equal(record.taxAmount, Math.round(record.amountExclTax * record.taxRate));
      assert.equal(record.amountInclTax, record.amountExclTax + record.taxAmount);
      for (const [field, value] of Object.entries(record)) {
        const months = field.match(/^monthly(\d+)ExclTaxDisplay$/);
        if (months) assert.equal(Number(value.replaceAll(',', '')), record.amountExclTax * Number(months[1]), record.id + ':' + field);
      }
    }
  }
});
