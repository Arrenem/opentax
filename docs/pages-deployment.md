# 手動のCloudflare Pages本番デプロイ

既存プロジェクト `opentax` の `main` を、GitHub Actionsから手動で公開する。
Macや開発端末の常時接続は不要。push・pull_request・scheduleからは公開しない。

## 初回の本人設定

1. [Cloudflare Account API Tokens](https://dash.cloudflare.com/?to=/:account/api-tokens)を開き、既存opentaxを所有するアカウントを選択する。
2. Create Token → Custom Token / Get started。Account → Cloudflare Pages → Edit のみを許可し、対象アカウントだけに限定する。DNS・Workers編集は不要。
3. 本人がトークンを作成する。この権限は対象アカウント内のPages全体を作成・編集・削除できる。opentax一件だけに限定される権限ではない。
4. GitHub `Arrenem/opentax` → Settings → Secrets and variables → Actions → New repository secret。
5. Nameを `CLOUDFLARE_API_TOKEN` にして、Secret欄へ本人が直接トークンを入力する。チャット・Issue・ログ・ソースコードへ貼らない。

アカウントIDは非秘密の定数としてworkflowに設定済み。GitHub PATは不要。トークンの発行・入力・更新は本人が行う。

## 実行

1. 公開対象の変更をレビューしてmainへmergeする。
2. GitHubのActions → Deploy OpenTax Pages → Run workflowでmainを選ぶ。
3. 実行時のmain commitを固定してテスト・buildする。途中でmainが進んだ場合は公開前に停止するため、新しいrunを手動実行する。
4. buildとdeployの両job、および最後の本番検証が成功したことを確認する。

Secret未設定時はdeployを開始しない。デプロイ操作自体は成功しても、その後の検証が失敗する場合がある。最後のjob失敗だけを見て「未公開」と判断せず、Cloudflareのdeploymentと本番内容を確認する。

## 検査と安全策

- workflow_dispatchのみ。リポジトリ名と `refs/heads/main` を両jobで確認し、任意branch・外部PR・入力値からデプロイしない。
- GitHub権限は `contents: read`。checkoutの認証情報をGit設定に保存しない。自動キャンセルしない固定concurrency groupで本番公開を直列化。
- Node 24.19.0、公式GitHub Actionsは検証済みcommit SHA、Wrangler 4.147.0と依存関係はlockfile/integrityで固定。
- build jobでアプリテスト・lint・TypeScript・本番site31テストとCI補助5テストを実施。CloudflareのSecretはこのjobに渡さない。
- 別のdeploy jobが同じrunのartifact IDだけを取得。digest不一致は停止。git checkoutやアプリ依存関係のインストールは行わない。
- deploy専用WranglerはSecretがない段階で `npm ci --ignore-scripts` によりインストール。Secretを渡すのは最後のWrangler公開ステップだけ。トークンをコマンド引数へ展開したり出力したりしない。
- 記事ID集合・公開53本・保留57/58・承認・証拠不足を検査。保留本文・専用画像は収録しない。今後公開範囲を変える場合は、レビュー後にガードとテストも更新する。
- 全配信ファイルのSHA-256を固定し、余計なファイル・symlink・Worker混入を拒否。検査済みartifactを再buildせず既存project/mainへ公開する。
- 公開後は53記事、保留2記事の404、その他ページ・静的assetを最大5分間確認し、本番レスポンスのbytesをbuildと照合する。canonicalなURLからの予期しないredirectや公開ページのX-Robots-Tag noindexも失敗にする。
- 現在のMock・GA・Privacy・freee承認本文の保全テストを維持。tokenを使うstep後のHTTP検査にはSecretを渡さない。

## 検証済みの依存元

- [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)
- [setup-node v7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0)
- [upload-artifact v7.0.1](https://github.com/actions/upload-artifact/releases/tag/v7.0.1)
- [download-artifact v8.0.1](https://github.com/actions/download-artifact/releases/tag/v8.0.1)
- [Wrangler 4.147.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler@4.147.0)
- [Cloudflare公式CI手順](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [GitHub公式Secret設定手順](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
