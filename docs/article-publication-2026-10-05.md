# 53記事の公開準備（2026-10-05）

## 対象と承認

プロジェクト所有者の53記事の公開・本番デプロイ承認を受け、記事ID 57・58以外の53本を公開対象に設定した。`status: published` と `publicationApproval: approved` は本番ビルドへの収録指定であり、現時点の本番配信完了を示さない。

- 53本の初回公開予定日・更新日・編集確認日を2026-10-05に設定。初回公開に合わせたメタデータ更新で、記事本文は変更していない。
- 57・58はdraft/pending、証拠不足と編集・税務レビュー要件をそのまま保持。本文・専用画像・一覧・関連記事・sitemapから除外する。
- 46・49・52・53・54・56の税務論点は10/4の本文SHA付き照合記録と一致。確認主体はAIアシスタントであり、有資格専門家の監修を意味しない。実装の制約と注意書きは維持。
- 25・31の電子保存に関する専門レビュー推奨は `reviewRequirements` と `suggestedEnhancements` に保持。未実施の推奨作業を完了扱いにしない。
- 日付をまたいで公開する場合は、実公開日に合わせて公開日・更新日・編集確認日と対応する回帰テストを再確認する。

## 当日の一次資料再確認

既存レビューを引き継ぎ、変更しやすい主要料金・制度条件を2026-10-05に再確認した。全出典・全製品の実機検証をやり直したことは意味しない。新規の重大な差異は確認されなかった。

- [freee料金・機能](https://support.freee.co.jp/hc/ja/articles/213726523)：スターター月1,780円／年11,760円、スタンダード月2,980円／年23,760円（税抜）、無料お試し・未契約時の制限を照合。
- [MF現行料金](https://biz.moneyforward.com/price/individual/)・[12月改定](https://biz.moneyforward.com/support/plan/news/20260924.html)：ミニ年10,800円据置、パーソナル年15,360円から22,560円（税抜）。既存契約は12月1日以降の更新から適用。
- [やよい青色](https://www.yayoi-kk.co.jp/shinkoku/aoiroshinkoku/price/)・[白色](https://www.yayoi-kk.co.jp/shinkoku/shiroiroshinkoku/price/)・[やよい26](https://www.yayoi-kk.co.jp/shinkoku/aoiroshinkoku/yayoiaoiro/price/)：登録料金、無料/半額の対象条件、期間、支払方法登録、取消期限を照合。
- [電子取引Q&A](https://www.nta.go.jp/law/joho-zeikaishaku/sonota/jirei/pdf/0026007-006_05.pdf)：前々年売上5,000万円以下かつダウンロード対応の検索免除条件。
- [必要経費](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2210.htm)・[所得税基本通達](https://www.nta.go.jp/law/tsutatsu/kihon/shotoku/07/01.htm)：家事按分と年末の債務確定条件。
- [源泉徴収](https://www.nta.go.jp/taxes/shiraberu/taxanswer/gensen/2795.htm)：対象報酬・税率・端数処理・消費税区分。
- [開業費](https://www.nta.go.jp/law/shitsugi/shotoku/04/08.htm)：60か月均等/任意償却と未償却残高の扱い。
- [減価償却](https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2100.htm)：2026年4月以後40万円未満、2029年3月31日期限・年300万円など対象条件。

40万円基準のOpenTax自動計算は未対応、取得月による計算、開業費・前受金科目の未対応は本文の注意書きどおり。57・58の2026年分最終手引き・申告画面・受付日程・出力読込の一致は未確認のまま。

## 検査と保全

- `npm run site:check`：31テスト成功。53本の公開境界、6カテゴリ、sitemap、canonical、robots/noindex、内部リンク/アンカー、GA、LP/Mock/Privacyを検査。
- `npm test`：19ファイル、108テスト成功。
- `npm run lint`、`npx --no-install tsc --noEmit`：成功。
- 承認済みfreee本文、`site/main.js`、`site/styles.css`、`site/analytics.js`、`site/privacy.html` は既存ハッシュと一致。
- 10/4に実施済みの全ページ・追加修正ページの実画面QAはそのまま有効な過去記録として保持。今回のクラウドブラウザでのlocalhost表示は `ERR_BLOCKED_BY_CLIENT` により実画面再検査未完了。静的検査の成功を今回のブラウザ検証成功として扱わない。

## 配信状態と残件

既存Cloudflare Pagesプロジェクト `opentax`、本番ブランチ `main`、独自ドメイン `opentax.fragmentware.com` を照合。現行本番デプロイは `6a326dae-63ff-4f02-9c61-5bf62857b2ed` のまま。

Cloudflareコネクタで非変更のasset存在確認（空hashリスト）を行ったところHTTP 403 / code 8000013 `Authorization failed`。Pages Direct Uploadのasset APIは専用upload JWTが必要だが、利用中のコネクタにはAuthorizationを切り替える指定がない。認証情報の発行・取得・移植や拒否後の迂回は行っていない。asset upload、deployment作成、mainへのmergeはいずれも未実施。

通常のWrangler認証か、正式なCIデプロイ経路の準備後に、最新mainとの再照合、公開日、今回の差分に対する実画面QA、merge、production buildとasset照合、deploy、全53 URL・保留2 URL・sitemap・HTTP・リダイレクト・GA・Privacy・Mockの本番確認を行う。Search Console/Rich Results、Lighthouse/Core Web Vitalsは今回未実施。
