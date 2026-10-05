# main更新時のCloudflare Pages本番デプロイ

既存プロジェクト `opentax` の `main` 更新（PRのmergeを含む）を、GitHub Actionsで検査して自動公開する。
Macや開発端末の常時接続は不要。手動の `workflow_dispatch` は予備として残す。任意branch・pull_request・scheduleからは公開しない。

## 初回の本人設定

1. [Cloudflare Account API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens)を開き、既存opentaxを所有するアカウントを選択する。
2. Create Token → Custom Token / Get started。Account → Cloudflare Pages → Edit のみを許可し、対象アカウントだけに限定する。fragmentware.com等のゾーンを対象にするとPagesには適用されない。JSON上の対象は `com.cloudflare.api.account.3f28ad99b5157218dea0db5a55241e4c` で、`account.zone` ではない。DNS・Workers編集は不要。
3. 本人がトークンを作成する。この権限は対象アカウント内のPages全体を作成・編集・削除できる。opentax一件だけに限定される権限ではない。
4. GitHub `Arrenem/opentax` → Settings → Secrets and variables → Actions → New repository secret。
5. Nameを `CLOUDFLARE_API_TOKEN` にして、Secret欄へ本人が直接トークンを入力する。チャット・Issue・ログ・ソースコードへ貼らない。

アカウントIDは非秘密の定数としてworkflowに設定済み。GitHub PATは不要。トークンの発行・入力・更新は本人が行う。

## 実行

1. 公開対象の変更をレビューしてmainへmergeする。
2. mainへのpushでDeploy OpenTax Pagesが自動的に開始する。pathsフィルターは設けず、workflow自身の変更も対象にする。
3. 起動時のmain commitを固定してテスト・buildする。途中でmainが進んだ場合は古いrunを公開前に停止し、新しいpushのrunが最新commitを処理する。必要時だけActions → Deploy OpenTax Pages → Run workflowでmainを手動実行する。
4. buildとdeployの両job、および最後の本番検証が成功したことを確認する。

Secret未設定時はdeployを開始しない。デプロイ操作自体は成功しても、その後の検証が失敗する場合がある。最後のjob失敗だけを見て「未公開」と判断せず、Cloudflareのdeploymentと本番内容を確認する。

## 検査と安全策

- mainへのpushとworkflow_dispatchのみ。リポジトリ名、`refs/heads/main`、許可されたeventを両jobで確認し、fork・任意branch・外部PR・入力値からデプロイしない。
- GitHub権限は `contents: read`。checkoutの認証情報をGit設定に保存しない。自動キャンセルしない固定concurrency groupで本番公開を直列化。
- Node 24.19.0、公式GitHub Actionsは検証済みcommit SHA、Wrangler 4.147.0と依存関係はlockfile/integrityで固定。
- build jobでアプリテスト・lint・TypeScript・本番site35テストとCI補助7テストを実施。CloudflareのSecretはこのjobに渡さない。
- 別のdeploy jobが同じrunのartifact IDだけを取得。digest不一致は停止。git checkoutやアプリ依存関係のインストールは行わない。
- deploy専用WranglerはSecretがない段階で `npm ci --ignore-scripts` によりインストール。Secretを渡すのは最後のWrangler公開ステップだけ。トークンをコマンド引数へ展開したり出力したりしない。
- 記事ID集合・公開53本・保留57/58・承認・証拠不足を検査。保留本文・専用画像は収録しない。今後公開範囲を変える場合は、レビュー後にガードとテストも更新する。
- 全配信ファイルのSHA-256を固定し、余計なファイル・symlink・Worker混入を拒否。検査済みartifactを再buildせず既存project/mainへ公開する。
- 公開後は53記事、保留2記事の404、その他ページ・静的assetを最大5分間確認し、本番レスポンスのbytesをbuildと照合する。既存のEmail Address Obfuscationが働く2文書だけは、後述の厳密な正規化を行ってから全体のSHA-256を照合する。canonicalなURLからの予期しないredirectや公開ページのX-Robots-Tag noindexも失敗にする。
- 現在のMock・GA・Privacy・freee承認本文の保全テストを維持。tokenを使うstep後のHTTP検査にはSecretを渡さない。

## 検証済みの依存元

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [upload-artifact v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)
- [download-artifact v8.0.1](https://github.com/actions/download-artifact/releases/tag/v8.0.1)
- [Wrangler 4.147.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler@4.147.0)
- [Cloudflare公式CI手順](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [GitHub公式Secret設定手順](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

## 2026-10-05の初回公開と検査修正

run 37289782478のattempt 2で、commit `74c515e001e275695a08466acc864c1dafbba94f` をproduction deployment `ee152d4c-2a13-415a-8f77-4ae0aee8d2a7` として公開した。Cloudflare公開ステップ自体は成功。公開後の厳密ハッシュ検査だけが既存 `/docs/contributing` と `/docs/self-hosting` で失敗した。

実レスポンスとbuildの差は、Cloudflareの[Email Address Obfuscation](https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/)による公開デモ用メール表記の置換と復号scriptの挿入のみ。設定・サイト本文・Mock・GA・Privacyは変更せず、検査側を修正した。

正規化するのはこの2 URLだけ。既知の属性・長さを持つanchorが1個だけで、復号結果が既存の公開デモ用アドレスに完全一致し、既知の復号scriptが1個だけ、かつmain.js直前にある場合に限る。その変換だけを戻して文書全体の元SHA-256と比較する。他の本文変更、異なるアドレス、追加属性、scriptの移動・重複・差替え、別URLの変換は許容しない。

過去のattempt 2の失敗表示は履歴として残る。認証修正前のattempt 1は、Pages Writeをアカウントではなくゾーンへ割り当てていたため、upload前のproject取得で停止した。権限の拡大や再デプロイを反射的に行わず、失敗したstepと配信内容を区別する。

## 自動公開への切替（2026-10-05）

本人の依頼により、mainへmergeした後の手動Run操作を省くため、mainのpushも起動条件に追加した。手動実行は予備として維持する。変更は起動条件・回帰検査・この手順書だけで、Secret、Cloudflare権限、公開先、検査済みartifactの受け渡し、直列実行、本番ハッシュ照合は変更しない。古いrunの再実行は古いSHAを維持する。mainが進んでいれば既存のSHA検査で停止するため、最新mainの新しいrunを確認する。
