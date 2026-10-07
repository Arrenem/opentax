import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = (file) => readFile(new URL(file, root), 'utf8');
const slugs = ['ai-journal-entry-workflow', 'bank-statement-csv-bookkeeping', 'freee-alternatives'];

test('worked examples state the isolation boundary and link to executable evidence', async () => {
  const manifest = JSON.parse(await read('content/articles/manifest.json'));
  for (const slug of slugs) {
    const body = await read(`content/articles/${slug}.md`);
    assert.match(body, /メモリ内/);
    assert.match(body, /2026年10月7日/);
    assert.match(body, /自動テスト|テスト用データ/);
    const entry = manifest.find((a) => a.slug === slug);
    assert.equal(entry.updatedAt, '2026-10-07');
    assert.ok(entry.sources.some((s) => s.url.endsWith('/lib/domain/journals/articleWorkflows.test.ts')));
    // The unchanged common LP image is explicitly illustrative, not evidence of these test runs.
    assert.match(entry.images.find((i) => i.path.endsWith('/opentax-demo.png')).caption, /説明用/);
  }
});

test('AI example distinguishes validation, correction, retry and user confirmation', async () => {
  const body = await read('content/articles/ai-journal-entry-workflow.md');
  for (const value of ['各79,000円', '経費6,000円', '預金増27,000円', '売上増0円', '事業利用割合を100％', '確認待ち0件', '同じ内容・同じ再送キー']) assert.ok(body.includes(value), value);
  assert.match(body, /同じ領収書の画像を自動で見分ける機能とは別/);
  assert.match(body, /売上と売掛金の選び違いは人の確認が必要/);
});

test('bank example states correct totals and does not claim direct CSV import', async () => {
  const body = await read('content/articles/bank-statement-csv-bookkeeping.md');
  for (const value of ['預金125,000円、売掛金0円、未払金0円', '入金60,000円、出金35,000円', '売上0円、経費3,000円', '事業利用割合を100％', '競合エラー']) assert.ok(body.includes(value), value);
  assert.match(body, /CSVの読取りや実際の銀行接続は含めていません/);
  assert.match(body, /キーを変えて送り直した取引や手入力済みの仕訳との重複/);
});

test('comparison result is scoped to OpenTax rather than an unperformed competitor trial', async () => {
  const body = await read('content/articles/freee-alternatives.md');
  assert.match(body, /売上30,000円、消耗品費2,000円、普通預金30,000円、売掛金0円、事業主借2,000円/);
  assert.match(body, /他社ソフトの操作を比較した実測ではありません/);
});
