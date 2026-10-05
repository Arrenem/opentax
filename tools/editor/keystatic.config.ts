import { config, fields, singleton } from '@keystatic/core';
export default config({
  storage: { kind: 'local' },
  singletons: {
    freee: singleton({
      label: 'freee料金の記事（ローカル下書き）',
      path: 'drafts/freee-cost-review',
      format: { data: 'json' },
      schema: {
        title: fields.text({ label: '記事タイトル', validation: { isRequired: true } }),
        description: fields.text({ label: '検索結果の説明', multiline: true }),
        summary: fields.text({ label: '冒頭の結論', multiline: true }),
        updatedAt: fields.date({ label: '更新日' }),
        markdown: fields.text({ label: '本文（Markdown）', multiline: true, description: '見出しは ##、表は | を使います。保存後、ターミナルで npm run apply を実行すると既存記事へ反映します。公開状態は変更されません。' }),
      },
    }),
  },
});
