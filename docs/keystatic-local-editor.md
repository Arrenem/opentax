# ローカル記事編集（Keystatic試作）

`tools/editor` は会計アプリと静的LPから独立した、ローカル限定Astro/Keystaticパッケージです。Rootのpackage.json、Markedのビルド、Cloudflare設定は変更しません。OAuth、GitHub App、API secret、有料サービスは使いません。

## 起動と編集

```sh
cd tools/editor
npm ci --ignore-scripts
npm run import
npm run dev
```

`http://127.0.0.1:4321/keystatic` の「freee料金の記事」を開きます。記事タイトル・検索結果の説明・冒頭の結論・更新日・Markdown本文を編集してSaveします。

Saveはローカル作業用の `tools/editor/drafts/freee-cost-review.json` に保存します。元の55記事はコピー移行しません。この生成JSONはコミット対象に含めず、編集開始時にimportで作り直します。Keystaticは.gitignore対象を読まないため、このJSONはgit statusに表示されます。原文と共有manifestを直接Keystatic形式へ変換すると、Markdoc/MDXのシリアライズで表・価格トークン・一文ごとの改行を変える可能性があるため、今回の本文欄は生Markdownのテキスト編集です。WYSIWYGではありません。

## 記事に反映して見た目を確認

```sh
npm run apply
cd ../..
git diff -- content/articles/freee-cost-review.md content/articles/manifest.json
npm run site:preview
npm run site:check
```

applyは本文とmanifest内の同記事の4説明項目だけを変更します。status・publicationApproval・sources・他の54記事を保持し、draft以外には反映しません。import後に元記事や同記事metadataが変更されていたら停止します。共有manifestの他の記事変更は最新ファイルから保持します。停止時は編集下書きを別ファイルへ保存してから再importし、差分を手動で合わせます。importは編集下書きを上書きするので、未反映の編集がある状態では実行しないでください。

apply後の再ビルドは手動です。CMS保存だけで公開・commit・push・deployは行いません。起動は127.0.0.1限定。認証なしのローカル書込UIなので、LANや公開サーバーへbindする運用は含みません。public/static配信へこのeditorをコピーしません。

## 検証

`npm run check` は一時ディレクトリ内の実ファイルでMarkdown保存往復、価格トークン・表の保持、metadata限定変更、他記事保持、draft/承認状態の保持、同時編集検出を確認します。実記事にテスト文字列を書きません。

## 今回の範囲と今後

最初の基準作品freee-cost-reviewのみ編集対象です。他54記事はdraftのまま既存ファイルを保持しています。記事デザインと編集操作の確認後、必要なmetadata欄・画像欄・全記事collectionへの拡張を検討します。現在の静的Cloudflare Pages配信にはKeystaticの書込APIは載りません。遠隔共同編集にはGitHub modeまたは別のNode実行環境・認証が必要です。GitHub App作成、OAuth secret、権限追加、ホスティング追加は今回未設定です。

一次資料: [Keystatic Astro integration](https://keystatic.com/docs/installation-astro)、[local mode](https://keystatic.com/docs/local-mode)、[format options](https://keystatic.com/docs/format-options)、[GitHub mode](https://keystatic.com/docs/github-mode)。確認日: 2026-10-02。
