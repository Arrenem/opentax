import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const load = async (file) => JSON.parse(await readFile(new URL('../../content/articles/' + file, import.meta.url), 'utf8'));
test('fictional published examples reconcile independently of tax or product claims', async () => {
  const [first, second] = await Promise.all(['examples-howto-a.json', 'examples-howto-b.json'].map(load));
  const cases = [...first, ...second];
  assert.equal(cases.length, 13);
  assert.equal(new Set(cases.map((c) => c.caseId)).size, cases.length);
  for (const example of cases) for (const entry of example.expectedEntries) {
    assert.ok(entry.debit && entry.credit);
    assert.ok(Number.isSafeInteger(entry.amount) && entry.amount > 0);
  }
  const find = (id) => cases.find((c) => c.articleId === id);
  const csv = find('47');
  assert.equal(csv.input.openingBank + csv.input.inflows.reduce((a, b) => a + b, 0) - csv.input.outflows.reduce((a, b) => a + b, 0), csv.verification.closingBank);
  const allocation = find('49');
  assert.equal(allocation.input.monthlyRent * allocation.input.businessOnlyArea / allocation.input.totalArea * allocation.input.months, allocation.verification.rentBusinessAnnual);
  const receivable = find('51');
  assert.equal(receivable.input.invoices.reduce((a, b) => a + b, 0) - receivable.input.receipts.reduce((a, b) => a + b, 0) - receivable.input.fee, 88000);
  const withholding = find('52');
  assert.equal(withholding.expectedEntries.reduce((a, b) => a + b.amount, 0), withholding.input.invoice);
  assert.equal(Math.floor(withholding.input.taxBase * 0.1021), withholding.input.withheld);
  const startup = find('53');
  assert.equal(startup.input.start - startup.input.amortizations.reduce((a, b) => a + b, 0), 0);
  const pc = find('54');
  assert.equal(pc.input.cost * pc.input.rate * pc.input.months / 12 * pc.input.businessRatio, pc.expectedEntries[0].amount);
});
