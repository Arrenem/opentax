# 静的記事の編集と検査

会計アプリとは別に、公開サイトの記事を `scripts/build-site.mjs` で生成します。
本文は `content/articles/<slug>.md`、公開制御・出典は `manifest.json`、
料金の共通値は `pricing.json` にあります。戦略資料や個人の帳簿は保存しません。

## ローカルで確認する

- `npm run site:check`：本番用ビルド、schema、リンク、SEO、GA、LP回帰を検査。
- `npm run site:preview`：draftも含めて `site/dist` に生成。全ページnoindex、
  GA測定IDを空にし、レビュー待ち事項を表示します。
- `npm run lint` と `npm test`：既存アプリを含む回帰検査。

プレビュー生成物を公開しないでください。本番ビルドはdraftの詳細と空カテゴリーを
生成せず、記事が未公開の場合の一覧にはnoindexを付けます。
`site:deploy` は本番用ビルドを再実行します。デプロイは別途承認された作業で行います。

## 編集する

記事本文にはH1とraw HTMLを使わず、見出しはH2から始めます。
URLは `/articles/<slug>`、カテゴリーは `/articles/category/<id>/`。
関連記事は実在するslugを参照し、本文からdraftへリンクしたまま公開しないでください。
一覧・関連記事は本番で公開済みだけを表示します。

料金の共通値は `{{pricing:<record-id>:<field>}}` で参照できます。
適用開始・終了日、月払い／年払い、税込／税抜を分けて確認します。
単なる参照日は価格が現在も正しいという保証になりません。

## 公開条件

`status: published` へ変更する前に、記事の回答・例・条件を確認し、
`reviewBlockers` を解消してください。出典の `verified`、`accessedAt`、
公開日・更新日・編集確認日が必要です。未来の公開日や不明な著者参照はビルドが拒否します。
個別判断を含む記事で編集品質基準として専門レビューを設定した場合は、確認までdraftに置きます。記事の公開に法的な一律監修義務があるという意味ではありません。
監修者や実測結果を、確認していない状態で記載しないでください。

価格・年分・機能が変わったときは共通データ、本文、関連する比較記事を同時に直し、
実質変更日にだけupdatedAtを更新します。訂正はcorrectionLogへ記録します。

GAのイベントは記事ID・分類・公開されたリンクだけを使います。
帳簿、本文、検索語、URLクエリ、個人情報をパラメータへ追加しないでください。

## 確認状態を分ける

`verificationStatus: editorial-review-ready` は一次資料と例を確認して編集レビューへ
進める状態です。公開済み・税務監修済みを意味しません。`additional-evidence-needed`
は `evidenceGaps` に具体的な不足資料を記録します。`reviewRequirements` は編集・
専門レビュー、`publicationApproval` は公開承認、`suggestedEnhancements` は本文が
主張していない実機検証などの補強を分けます。

公開前には `publicationApproval` を承認済みにし、`evidenceGaps` と
`reviewBlockers` を解消します。`requiresTaxReview` の記事には実在する著者台帳の
`taxReviewerId` と実際の `taxReviewedAt` が必要です。記録だけを埋めて承認を代用
しないでください。価格・税務記事は有効な `reviewDueAt` も必須です。

`taxReviewRecommendation` は正確性向上の推奨、`taxReviewTopics` は具体論点です。基本記帳・手順記事へ一律に `requiresTaxReview` を付けず、適用判断を含む記事の編集品質基準に限って使います。専門家への依頼は別途ユーザーの許可が必要です。
