# 開発バックログ

追跡 Issue: [#1](https://github.com/Arrenem/opentax/issues/1)

## OT-SETUP-001 — 一コマンド・セルフホスト（開発中 / Unreleased）

目的: 利用者自身のクラウドに、費用・地域・権限を確認して個人用の会計環境を構築する。初期対象は Node 22+、macOS/Linux、新規の専用個人プロジェクト、東京リージョン。既存組織プロジェクト、Windows、独自ドメイン、SQLite 移行は対象外。

### この PR に実装済み（モック・ローカル検証）

- [x] `npm run setup` の計画→任意の構築開始、入力検証、費用・権限プレビュー、dry-run / resume / apply / verify / offline doctor。
- [x] 保存済み計画を実行同意と扱わず、本人が工程ごとに確認。Google Cloud CLI の独立した認証ストアとブラウザによる owner UID 確定。
- [x] Firebase project/Web app/Google Auth、課金、API、Firestore、証憑 Storage、限定 IAM、ルール・索引、Cloud Run の実行コード。作成前の照合と実行後検査。
- [x] 計画 CAS、対話排他、固定 source revision、operation チェックポイント、同じ設置 ID の再利用、不一致時停止。既存データの自動削除なし。
- [x] 公開 Firebase 設定をビルド時に渡し、実 Cloud Run URL を auth domains / OAuth issuer に反映。runtime は ADC と owner 制限、自己 SA の signBlob のみ。
- [x] 実 URL の本人/匿名/別 Google UID 検査、予約領域の DB/証憑/署名読取/合成コピー復元、別承認済み read-only MCP token の read / scope-denial 検査コード。
- [x] Web/静的エージェント/OAuth/MCP の owner 制限、legacy 互換と移行説明。
- [x] GitHub と LP の共通リリースノート、導線・メタデータ・回帰テスト。
- [x] 中断・曖昧な書込結果・drift・同意拒否・競合状態保存・権限境界・source からの秘密情報除外のモック/隔離試験。

### 完成までの受入条件（未完了）

- [ ] 別途承認された使い捨てプロジェクトで、文書外の手修正なしに一連の構築を完了。課金・Google Auth brand/redirect・API・索引・Cloud Run source build の実動作を確認。
- [ ] 個人用構築権限の最小セットと Google Cloud CLI の互換版を確定。組織ポリシー制約を切り分ける。runtime の keyless signBlob と実証憑読取を確認。
- [ ] 全クラウド工程で中断→同じ計画から再開し、資源が重複しないことを確認。モックで検査した失敗経路も実環境で確認。
- [ ] 合成仕訳の書込/読取・確認待ち・証憑添付を含む会計フローを検査。現状の予約 fixture 検査で代替しない。
- [x] DB/証憑全体のバージョン付きバックアップ、型/ハッシュ/参照検査、書込メンテナンス、別の空環境への同一UID隔離復元・中断再開を実装。手順は `docs/ledger-backup.md`。
- [ ] 上記を実クラウドで受入検査。ローカル/エミュレーター検査で代替しない。`fullAccountingRestore` / `journalAcceptance` のセットアップ判定は引き続き `not-tested`。
- [ ] 実環境で別 UID の Web/静的エージェント/OAuth/MCP 拒否と read-only MCP の成功/未許可 write 拒否を確認。
- [x] Ubuntu24.04/macOS15 × Node22/24 の credential-free setup CI と、Ubuntu/Node24 のアプリ・サイト検証を追加。
- [ ] Linux と Node22 の実クラウド構築をクリーン環境で完了確認。CIのモック試験だけでは対応完了にしない。
- [ ] 安全な source revision 更新・アプリ rollback・整合バックアップ復元を区別した更新手順。計画の移行・孤立 checkpoint の回復支援は現状手動。
- [ ] 上記の証跡を得て一般提供の判断を行い、実際の公開 commit/deployment を Unreleased から公開履歴へ移す。

この PR の開発・検証では実プロビジョニング・課金・IAM・認証情報の作成・デプロイ・本番試験を行っていません。実行コードが存在することと、実環境での完了確認は別です。実際に新しい永続アクセスや資源を作る際は、本人の別途の実行時承認が必要です。
