# 55記事の改稿・表示準備（2026-10-03）

## 反映内容

- 54本文と検索メタ情報、文脈リンク、一次出典を更新。`freee-cost-review.md` は承認済み本文のバイト列を保持。
- 54記事に、本文の表・具体例に基づくオリジナル図解、共有用PNG、記事別サムネイルを追加。カテゴリと記事形式のタグを表示。
- 本文の結論を目次の後へ置き、OpenTaxの紹介→公式LPのデモ画像→CTA→小さい出典の順に統一。出典の重複表示を解消。
- 明示的な `publicationApproval: approved` がない公開を拒否。承認だけで未解決の証拠・編集・税務レビューや期限切れ確認を迂回できない。
- 見出しアンカーを安定化し、明示的IDと目次を一致。重複ID・テンプレートIDの衝突を拒否。
- 記事別のArticle.image/OG画像、画像寸法・代替文、可視パンくずと構造化データの対応を整備。
- 本番出力へ下書き本文・下書き専用画像をコピーしない。previewからproductionへ再生成した場合も除去する。

## 検査

- `npm run site:check`: 28テスト成功（全55詳細の生成・リンク・アンカー・メタ・公開境界・LP/GA/Privacy回帰を含む）。
- `npm test`: 18ファイル、104テスト成功。
- `npm run lint`: 成功。
- `npx --no-install tsc --noEmit`: 成功。
- `npm run build`: 成功。会計アプリの本番ビルドのみで、公開・デプロイは実行していない。
- `node --test tools/editor/scripts/bridge.test.mjs`: Markdown往復、他記事・承認状態の保持、競合検出に成功。
- 図解生成時に本文照合、全54件の配置アンカー、XML、文字のキャンバス内収容、日本語フォントの字形、PNG寸法と全54画像の固有性を検査。
- 全74 preview HTMLにnoindex、配信設定にX-Robots-Tag、GA測定ID空。記事sitemap URLは0。
- 全55記事はdraft・pendingのまま。57/58の2026年分最終資料・画面の未確認事項と専門確認ゲートを維持。

## 既存LPの保護

最新main `564d36eb730444db835be5066511da372c864078` と、今回の `site/main.js`, `site/styles.css`, `site/analytics.js`, `site/privacy.html` はバイト一致。
元の本番アセットと照合した既存ハッシュテストも成功。今回のcloudから本番URLへの直接取得は403だったため、今回のライブHTTP確認成功とは扱わない。

基準記事本文SHA-256: `9904ec8c84741db045a277f043c3bfa4d9ea07d7eda71b182062db70516d51c2`

## 残る検査と公開判断

実ブラウザで360/390/768/1440pxの全記事・一覧・6カテゴリ、TOCジャンプ、図解SVG、表の横スクロール、画像拡大、Back/Forwardを確認する。
Cloudのブラウザ起動・localhost表示制限があるため、別の許可済み検証環境で同じcommitを検証する。

ライブのHTTP/リダイレクト、Search Console、Rich Results Test、Lighthouse/Core Web Vitalsは未実施。全記事の本番公開、PRのmerge、deployは別途承認が必要。

## 図解の再生成

`python scripts/site/generate-article-visuals.py` で再生成できる。PillowとfontToolsを使用し、外部画像やネットワーク取得は行わない。
`content/articles/editorial/` は出典・判断条件・未解決事項、`visual-assets.json` は図解と元の表・段落の対応を記録している。
SVGには必要な日本語フォントのサブセットを埋め込む。本文の数値・条件はHTMLでも読め、図の代替テキストも備える。
