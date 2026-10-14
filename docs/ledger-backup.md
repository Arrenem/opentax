# 帳簿全体のバックアップと隔離復元（Unreleased）

管理者向けの実験的な CLI です。実 Google Cloud での通し受入は未完了です。既存の CSV / XTX 出力やセットアップ用 fixture のコピーとは別の機能です。CSV は検索 API の上限（同一年の現行仕訳500件）を受けるため、完全なバックアップには使えません。

## 対象と保存形式

同一 Firebase UID の次の11コレクションをページングして保存します。現行だけでなく過去版・論理削除済みの仕訳、監査履歴、冪等性記録も含めます。

`journals`、`documents`、`fixedAssets`、`userSettings`、`taxFilings`、`customers`、`projects`、`issuedDocuments`、`billingCounters`、`auditLog`、`idempotency`。

証憑は署名URLではなくファイル本体・content type・世代・SHA-256を保存します。形式/version、元プロジェクト/DB/バケット/UID、全件数に対応するレコードと型付き Firestore 値、全体ハッシュを持つ JSON アーカイブです。整数は int64 精度、Timestamp はナノ秒精度を保持します。同一元DB内の参照だけを復元先へ付け替えます。外部プロジェクト/DB参照、未知の帳簿コレクション、未対応のネストしたコレクションは省略せず停止します。

過去の操作で対象が物理削除された監査・冪等性参照は `historicalMissingReferences`、帳簿に未接続の証憑オブジェクトは `orphanEvidencePaths` に明示し、ハッシュ対象に含めます。認証情報、Firebase Auth ユーザー、OAuth/エージェント接続・権限、IAM、Firebaseルール、索引、インフラ設定は移行しません。元に既に存在しない履歴やファイルを再生成する機能ではありません。

アーカイブは会計情報・取引先・証憑を含む**暗号化していない機密ファイル**です。新規ファイルを0600で作成し既存ファイルを上書きしません。非公開の保管先を指定してください。ファイルの共有、外部アップロード、長期保管の暗号化はこのCLIでは行いません。初版はメモリ内でアーカイブを処理し、読込上限は512MiBです。超過時は分割してごまかさず停止し、ストリーミング形式の対応を待ってください。

## 実行前の条件

- Node22以上、ロック済み依存のインストールが必要です。`npm run backup` はローカルCLIをビルドします。
- 別途承認・設定されたADCを使います。CLI自身はログイン、鍵発行、権限付与、課金紐付け、資源作成をしません。適切な管理者が元/先プロジェクトの対象DBとバケットを確認してください。
- **全ての書込元をこの版へ更新し、古いCloud Run revision・外部Admin SDK・手動管理者書込を停止してください。** ロックを無視する外部管理者の変更を防ぐものではありません。
- 管理者用CLIをWeb/MCPのエンドポイントに公開しないでください。
- 復元先は元と異なるプロジェクト・バケット、同じUID、既定DBのみ。DB全体とバケット全体が空で、既存プロフィール/他UID/認証接続記録がない隔離先を使います。構築用セットアップfixtureもある場合は拒否します。インフラ設定は別途準備してください。

## コマンド

以下は架空の値です。初期値ではローカル計画だけを表示し、認証情報やクラウドにアクセスしません。

```sh
npm run backup -- export --project opentax-source-example --bucket opentax-source-example-evidence --uid example-owner --archive ./ledger.opentax-backup.json
npm run backup -- validate --archive ./ledger.opentax-backup.json
npm run backup -- restore --project opentax-restore-example --bucket opentax-restore-example-evidence --uid example-owner --archive ./ledger.opentax-backup.json
```

実行する場合は同じコマンドに `--apply` を付け、対話端末で表示された対象を確認し、`EXPORT <project> <uid>` または `RESTORE <project> <uid>` を入力します。非対話の自動承認はありません。`validate` は常にオフラインで、形式・型・参照・証憑/全体ハッシュを確認します。ハッシュは破損検出であり、アーカイブ作成者の電子署名ではありません。信頼する保管元のファイルだけを使ってください。

## 整合性、復元、再開

全てのアプリ帳簿書込は分散writer leaseを取得します。メンテナンス取得後は新規書込を503で拒否し、既存writerの終了を待ちます。証憑アップロード・DB登録・失敗時の後片付けまでleaseの範囲です。snapshotはロック保持を確認し、レコード/証憑を二度読んで変更を検出します。読取だけのsnapshot失敗は安全にロックを解放します（writer排出待ちの失敗・プロセス終了は例外）。

復元はアーカイブ全体を検査してから開始し、空の隔離先だけへ書き込みます。同じアーカイブの復元途中を再開するときは、既存データがそのアーカイブの完全一致する部分集合であることを確認します。証憑は世代条件で新規作成し、既存の異なる内容を上書きしません。全レコード・型・証憑bytesの一致を再読取で検証するまで書込を開放しません。別アーカイブや無関係なデータは拒否します。失敗した復元は閉じたままで、同じコマンドの再実行で照合・再開します。二重runnerは拒否します。

強制終了、排出待ちtimeout、応答不明でwriter/runnerが残ると自動解除しません。**経過時間だけで削除しないでください。** 管理者が古いプロセス/アプリrevisionの停止と資源状態を確認し、状態を安全に保全してから個別に照合・修復します。この初版に強制解除コマンドはありません。復元成功後も、別途用意した所有者認証・署名読取・HTTP/MCP・全年度帳票の実環境確認を行ってから利用開始してください。

## 検証の区別

自動ユニット試験はメモリアダプターと型/破損/競合/所有者/復元先境界を検査します。`scripts/backup/emulator-acceptance.sh` はローカルのFirestore/Storageエミュレーターだけを使用し、721文書・507仕訳・205証憑、11コレクション、整数精度・Timestamp/参照・中断再開・確認待ち状態・全件一致と帳票整合を検査します。Java21と公式 `firebase-tools@15.33.0` が必要です。すべて合成データです。

エミュレーター成功は、Google認証、実クラウドIAM、keyless署名URL、課金、Cloud Run構築・再開の成功を意味しません。`fullAccountingRestore` / `journalAcceptance` のセットアップ自動判定は引き続き `not-tested` であり、このCLIの独立した証跡をそれらへ自動流用しません。
