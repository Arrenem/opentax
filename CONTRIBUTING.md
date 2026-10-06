# コントリビューションガイド

OpenTax に関心を持っていただきありがとうございます。不具合の報告、税務ロジックの指摘、ドキュメントの改善、コードの修正など、どんな形の参加も歓迎します。

## Issue の作り方

- **不具合・要望:** [Issue](https://github.com/arrenem/opentax/issues/new/choose) から、テンプレートに沿って作成してください。
- **税務ロジックの誤り:** 「税務ロジックの指摘」テンプレートを使い、可能であれば根拠となる法令・通達・国税庁の資料を添えてください。税務ロジックの指摘はプロダクトへの攻撃ではなく、OpenTax を良くするための大切な貢献だと考えています。
- **セキュリティの問題:** 公開の Issue ではなく、[セキュリティポリシー](SECURITY.md) に沿って非公開で報告してください。

個人情報や実際の帳簿データ、トークンを Issue に貼らないでください。

## 開発環境

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run source:check
npm run build
npm run mcp:test
```

Firebase を使わずに画面を確認したい場合は、開発サーバー（`npm run dev`）で `test@example.com` / `test1234` でサインインするとテストモードで動きます。本格的なセットアップは [セルフホストガイド](docs/self-hosting.md) を参照してください。

## Pull Request

1. 大きな変更の場合は、先に Issue で方針を相談してください。
2. ブランチを作成し、変更に対応するテストを追加・更新してください。
3. `npm test`・`npm run lint`・`npm run typecheck`・`npm run source:check`・`npm run build` が通ることを確認してください。
4. Pull Request には、変更の目的と確認方法を書いてください。

## 公開ソースの境界

このリポジトリへの変更は、会計アプリ・MCP・テスト・利用と開発のドキュメントを対象にしてください。公式サイトの LP、記事・画像、編集と配信の運用資料は別の非公開ソースで管理します。公開する変更にそれらを含めないでください。検査方法は [公開ソースの境界](docs/public-source-boundary.md) を参照してください。

## 設計上の約束

- **AIが解釈し、OpenTax が検証して記録する。** OpenTax 本体や MCP アダプターに、LLM の呼び出し・OCR・勘定科目の自動分類・形式の推測を追加しません。
- **会計・税額の計算は決定的なコードで。** 同じ入力には常に同じ結果を返し、テストで検証します。
- **年分によって変わる値は集約する。** 税率や期限などは `lib/tax/taxYearRules.ts` と `lib/accounting/periodConfig.ts` で管理し、[税制ルールと出典](docs/tax-rule-sources.md) に出典を追記してください。
- **人による確認を迂回しない。** エージェントからの書き込みは確認待ち・下書きから始まり、確定は Web 画面で人が行います。
- **すべての変更を監査ログに残す。**

詳しくは [アーキテクチャ](docs/architecture.md) を参照してください。

## AI による開発支援について

AI コーディングツールを使った貢献も歓迎します。ただし、提出するコードの内容はご自身で理解・確認し、テストで検証してください。

## ライセンス

OpenTax への貢献は、[GNU Affero General Public License v3.0](LICENSE) の下で提供されることに同意したものとみなします。
