# セルフホスト・セットアップ（Unreleased / 実環境未検証）

`npm run setup` は、計画作成から工程ごとの明示同意、Firebase 構築、会計アプリの Cloud Run 配置、接続検査へ進む実装です。**この PR ではモックと隔離したローカル環境だけで検証しています。実クラウドでの成功や一般提供開始は確認していません。** 既存の[手動手順](self-hosting.md)も参照してください。公開 npm パッケージ `@opentax/setup` はありません。

## 前提と開始

Node.js 22 以上、Git、tar、Google Cloud CLI (`gcloud`)、ブラウザを備えた macOS/Linux が対象です。クリーンなコミットをチェックアウトして `npm ci` でロック済み依存を入れてください。東京 `asia-northeast1` の新規個人専用プロジェクトだけを扱います。既存プロジェクトの取り込み、組織固有の制約、Windows、独自ドメインは未対応です。

```bash
npm run setup
```

プロジェクト ID、Google アカウント、課金アカウント ID、リージョン、owner UID を対話で入力します。UID が未作成なら `pending` を入力します。入力は `.opentax/plan.json` に保存されます。費用・権限・資源の計画を読み、`SAVE PLAN` で計画を確定します。続いて `BUILD <project-id>` で実行工程へ進むか、Enter で計画だけ保存して終了します。

各工程は資源と必要権限を表示し、`YES <工程ID>` を本人が入力した場合のみ変更します。保存済み計画や前回の承認を実行許可として再利用しません。非対話の自動承認オプションはありません。拒否するとその場で停止し、済んだ工程を保全します。

```bash
npm run setup -- --dry-run --config scripts/setup/example.json
npm run setup -- --resume
npm run setup -- --apply
npm run setup -- --verify
npm run setup -- --doctor
```

- `--dry-run` はネットワーク・認証情報・依存インストール不要で、保存もログインもしません。例の値は架空です。`--resume --dry-run` は保存済み計画の表示です。
- `--resume` は入力・計画から再開し、実行へ進むかを再確認します。`--apply` は保存済み計画の構築工程を再開します。
- `--verify` は同じ計画・ソースの実リソースを読み取り確認し、本人の追加同意があれば合成データの検査を行います。再構築はしません。
- `--doctor` はローカル計画だけを確認し、実接続を検査しません。常に `ready:false`・終了コード2です。`/api/health` の `ok` も接続検査の代替ではありません。

## 本人確認・構築の内容

最初に Google ログインとローカルへの認証情報保存について別途同意します。Google Cloud CLI が `.opentax/gcloud` にログインと ADC の認証情報を保存します。既存のグローバル設定は使いません。次回も利用前に同意を確認します。このディレクトリは他者に共有・添付しないでください。CLI の入力欄へ秘密鍵・パスワード・トークンを貼り付けないでください。

新規プロジェクト、課金紐付け、必要 API、Firebase、Firestore Native、非公開の証憑バケット、Web app、Google Auth、専用サービスアカウントと IAM、deny-all クライアントルールと索引を順に構成します。同じ設置 ID の資源だけ再利用し、無関係な既存プロジェクト/バケット、異なる課金先や DB 地域は拒否します。Auth の設定には公開済みの `firebase-tools@15.33.0` をダウンロードして実行する工程を含みます。匿名認証とメール/パスワード認証は無効にします。

Google Auth 用の Firebase Hosting サイトも作成しますが、会計アプリは Cloud Run に配置します。loopback (`127.0.0.1`) の一時ブラウザ画面で、指定した Google メールアドレス本人の verified identity を確認し、対象 Firebase の UID を確定します。ID トークンはメモリ内のみで扱います。未確認 UID のまま公開しません。

アプリ・Firestore/Storage ルール・索引は、ログイン待ちに入る前に同じ固定 Git コミットのアーカイブから取得します。待ち時間中に作業ツリーを編集しても、その内容を構築に使いません。ビルドに送るのはこの固定した内容です。未コミット変更を拒否し、ローカルの `.env` や認証情報フォルダを送信しません。公開 Firebase 設定をビルド時にも設定し、Webpack production build を使います。ADC と owner 制限は実行時に設定します。Cloud Run が返した URL を Firebase の承認済みドメインと `OPENTAX_PUBLIC_URL` に反映します。

## 費用と必要権限

Cloud Storage for Firebase は Blaze と課金先の紐付けが必要です。無料を保証しません。Cloud Run、Cloud Build、Artifact Registry、ソース保管、Firestore、Storage と転送、バックアップが費用要素です。min=0/max=1 や予算アラートは総額の上限ではありません。[Firebase の課金条件](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)

本人にはプロジェクト作成・課金紐付け・API 有効化・Firebase/Auth/DB/Storage 管理・必要 IAM 変更・ソースビルド/デプロイ権限が必要です。工程ごとのプレビューに表示します。不足や組織ポリシーで拒否された場合は停止し、Owner/Editor の一括付与で回避しません。環境固有の最小構築権限の検証は残っています。

runtime SA は専用プロジェクトの `roles/datastore.user`、証憑バケットだけの `roles/storage.objectUser`、自身の SA だけの `iam.serviceAccounts.signBlob` カスタムロールです。builder SA はプロジェクトの `roles/run.builder` です。既存 IAM binding と etag を保持し、競合時は再確認します。長期秘密鍵を作らず、project-wide Token Creator を runtime に付与しません。keyless 署名の実クラウド検証は未実施です。[署名 URL の公式資料](https://docs.cloud.google.com/storage/docs/access-control/signing-urls-with-helpers)

## 再開と安全な復旧

計画の形式は v2 です。承認済み計画の置換・draft への巻戻しを拒否し、revision による競合検出と対話全体の排他を行います。実行状態は `.opentax/execution.json` に設置 ID・ソース SHA・工程・公開設定を保存します。承認や ID/MCP トークンは保存しません。新規ディレクトリは0700、状態ファイルは0600です。

再開時は計画・ソース SHA とクラウド側の事後条件を照合します。確認済み資源に drift があれば停止します。応答不明の作成は次回に資源を照合し、API の長時間 operation も保存して再開します。書込 API を無条件リトライせず、自動削除・課金解除・データ上書きで復旧しません。

強制終了で `session.lock`、`plan.pending`、`execution.pending` が残る場合は、PID とプロセスの終了を本人が確認し、状態を非公開の安全な場所へバックアップしてから stale ファイルを手動で退避してください。pending の存在だけを理由に完成済み状態を消さないでください。破損状態、別 revision、旧形式は自動移行しません。クラウド作成後は設置 ID を失わないようにし、別計画で既存資源を取り込もうとしないでください。計画/ソース変更や復旧不能な状態は、資源一覧と状態を照合して個別に復旧する必要があります。

## 所有者制限と既存環境の移行

新しい個人環境には次を設定します。UID はメールアドレスではなく、対象 Firebase プロジェクトの Authentication に登録された本人の UID です。公開する前に別途本人のログインで確認してください。

```dotenv
OPENTAX_ACCESS_MODE=owner
OPENTAX_OWNER_UID=<本人のFirebase UID>
```

owner モードで UID が空・不正なら全員を拒否します。設定のない既存環境や空の example 設定は従来どおり UID ごとに利用できます。`OPENTAX_OWNER_UID` に値を設定すれば `legacy` またはモード未指定でも制限が有効です。不明なモード名は拒否します。

制限対象は会計 Web API、静的エージェントトークン、OAuth 認可/コード交換/refresh、MCP です。公開画面、Firebase のサインイン/登録サービス、MCP の公開メタデータ・動的クライアント登録まで非公開にする機能ではありません。Firebase 側で匿名認証を無効にし、必要なプロバイダと承認済みドメインを限定してください。新規登録の制御は別設定です。クライアント直接 DB/Storage アクセスは既存ルールで全拒否します。

既存環境は、利用中の UID とエージェント接続、データのバックアップを確認したうえで、本人 UID とモードを明示して更新します。他 UID の既存トークンも次の API/MCP アクセスで拒否されます。複数の正当な利用者がいる環境は単一 owner に切り替えず現行モードを維持し、別途移行を計画してください。所有者切替はデータ移行ではなく、旧 UID の帳簿を新 UID にコピーしません。誤設定時は既知の本人 UID に修正し、アクセス検査をやり直します。

## 接続検査と MCP

構築後は実 URL を表示し、未検査があれば `ready:false`・終了コード2で報告します。完了の `ready:true` は次の接続検査がすべて成功した意味で、会計製品全体の受入完了ではありません。

1. 本人の Web API 成功と匿名アクセス拒否。
2. 別同意のうえ、予約領域 `_opentaxSetupChecks` と `opentax-setup/` に合成 fixture を保存・読取。証憑は keyless 署名 URL から読取し、コピーを隔離した予約領域へ復元。既存 fixture が不一致なら上書きせず停止し、検査後も自動削除しません。
3. 本人が別の Google テストアカウントでログインし、Web API の403を確認。この操作で Firebase のテストユーザーが登録される場合があります。
4. 実 URL の `/agent-connections` で、本人が **read のみ** のエージェント接続を別途承認・作成。一時的なローカルブラウザへトークンを入力して `/api/mcp` の `get_business_context` を呼び、認証付き GET で実スコープが `read` だけであることと、書込スコープ判定の拒否を確認します。実際の書込 API は検証プローブに使いません。トークンは自動作成・保存しません。利用終了後の失効はアプリの接続管理から本人が行います。

別の管理者向け[帳簿バックアップ・隔離復元CLI](ledger-backup.md)を追加しました。全帳簿・証憑の検査を行いますが実クラウド受入は未完了です。`fullAccountingRestore` と `journalAcceptance` は引き続き `not-tested` です。合成 fixture の復元は、仕訳・確認待ち状態・証憑を含む整合したバックアップの代替ではありません。実環境での OAuth/静的トークン/MCP の別 UID 拒否、Linux/Node22 の実クラウド構築、全工程の中断試験も[バックログ](development-backlog.md)に残ります。

Cloudflare Pages は公式 LP・記事用です。アプリ revision のロールバックだけでは DB や証憑は復元されません。既存環境の接続方法は [MCP ガイド](mcp.md)を参照してください。
