# OpenTax

**AIエージェントから使う、日本の個人事業主向けオープンソース会計基盤**

> [!IMPORTANT]
> **Developer Preview（開発者プレビュー版）**
>
> OpenTax は開発中の実験的なオープンソース会計ソフトです。税務相談サービスではなく、メンテナーは税理士などの資格を持っていません。
> 帳簿や申告の内容はご自身で確認し、必要に応じて税理士などの専門家にご相談ください。詳しくは [免責事項](DISCLAIMER.md) と [既知の制限事項](KNOWN_LIMITATIONS.md) をご覧ください。

- 公式サイト・ドキュメント: https://opentax.fragmentware.com
- ライセンス: [GNU AGPL v3.0](LICENSE)

## OpenTax とは

いつものAIエージェントを持ち込んで使う会計ソフトです。Claude や ChatGPT のチャット、Claude Code、Codex など MCP に対応したエージェントが領収書や銀行明細を読み取り、構造化された記帳リクエストを作ります。OpenTax はそれを検証して記録し、帳簿・決定的な会計/税額計算・請求書・証憑保管・レポート・e-Tax 用ファイル出力を担います。

**AIが解釈し、OpenTax が検証して記録する。** OpenTax 自身は LLM・OCR・自動仕訳分類を持たないため、セルフホストに AI サービスのアカウントは不要です。

```text
Claude / ChatGPT チャット            Claude Code / Codex
        │ リモート MCP (OAuth)              │ stdio MCP
        ▼                                  ▼
   /api/mcp  ── 共通ツール定義 ──  packages/opentax-mcp
        │                                  │ 認証付き HTTPS
        └────────────────┬─────────────────┘
                         ▼
                    OpenTax API
                         │
              ┌──────────┴──────────┐
              │   ドメインサービス   │
              └──────────┬──────────┘
                Firestore + Storage
```

## 主な機能

- サーバー側で検証される複式簿記の仕訳（監査履歴・確認フロー・一括登録）
- スコープ付きで取り消し可能なエージェント用トークン。エージェントが登録した仕訳は、Web画面で人が確認するまで「確認待ち」のまま
- 取引先・案件・見積書/請求書/領収書・証憑・固定資産・損益計算書/貸借対照表・税額プレビュー・e-Tax 用 XTX 出力
- Web とエージェントで共通の、決定的な会計・税額計算
- PDF / JPEG / PNG（最大 10 MB）の証憑アップロード。OpenTax はファイルと付与されたメタデータを保存するだけで、内容の解釈はしません

## はじめかた（セルフホスト）

必要なもの: Node.js 22 以上、Authentication・Firestore・Cloud Storage を有効にした Firebase プロジェクト、Firebase Admin 用の認証情報。

```bash
git clone https://github.com/arrenem/opentax.git
cd opentax
npm install
cp .env.local.example .env.local   # ご自身の Firebase の値を記入
npm run dev
```

Firestore/Storage のルールとインデックスのデプロイ、認証プロバイダの設定などの詳細は [セルフホストガイド](docs/self-hosting.md) を参照してください。

`NTA_APP_ID` は国税庁のインボイス登録番号照合にのみ使う任意設定です。LLM・OCR・AI サービスの認証情報は不要です。

## エージェントをつなぐ

**Claude / ChatGPT のチャット（リモート MCP）:** `https://<あなたのOpenTax>/api/mcp` をカスタムコネクタとして追加し、OpenTax の同意画面で許可するスコープを選びます。URL は **Agent接続** 画面に表示されます。

**Claude Code・Codex などのローカルエージェント（stdio）:**

1. OpenTax にサインインし、**Agent接続**（`/agent-connections`）を開きます。
2. 必要最小限のスコープで接続を作成します。表示されたトークンは一度しか表示されないので、すぐに保存してください。
3. `OPENTAX_BASE_URL` と `OPENTAX_AGENT_TOKEN` を設定して stdio サーバーを登録します。
4. 申告用ファイルを出力する前に、`/review` で確認待ちの仕訳を確認・確定します。

設定例とツール一覧は [MCP 接続ガイド](docs/mcp.md) を参照してください。

## 開発

```bash
npm install
npm test            # ユニットテスト
npm run lint
npm run build
npm run mcp:build   # stdio MCP サーバーのビルド
npm run mcp:test
npm run site:build  # 公式サイト（LP + ドキュメント）のビルド
```

`npm run mcp:start` は MCP 用の環境変数 2 つを設定したうえで stdio サーバーを起動します。標準出力は MCP プロトコル専用です。

## ドキュメント

| ドキュメント | 内容 |
| --- | --- |
| [セルフホストガイド](docs/self-hosting.md) | Firebase の準備からデプロイまで |
| [MCP 接続ガイド](docs/mcp.md) | Claude・ChatGPT・Claude Code・Codex との接続、ツール一覧 |
| [アーキテクチャ](docs/architecture.md) | エージェントと OpenTax の役割分担、認証、監査 |
| [税制ルールと出典](docs/tax-rule-sources.md) | 実装している税制ルールと参照した公式資料 |
| [既知の制限事項](KNOWN_LIMITATIONS.md) | 未対応の範囲と注意点 |
| [免責事項](DISCLAIMER.md) | 利用にあたっての注意 |
| [コントリビューションガイド](CONTRIBUTING.md) | 不具合報告・税務ロジックの指摘・開発への参加方法 |
| [セキュリティポリシー](SECURITY.md) | 脆弱性の報告方法 |

## 開発の透明性について

OpenTax の開発には AI によるコーディング支援を利用しています。会計・税額の計算は決定的なコードで実装され、テストで検証され、誰でもレビューできるように公開しています。「誰が書いたコードでも、検証できなければ信用しない」という方針です。税務ロジックの誤りの指摘を歓迎します。

## ライセンス

[GNU Affero General Public License v3.0](LICENSE)。改変した OpenTax をネットワーク越しにサービスとして提供する場合も、そのソースコードを利用者に公開する必要があります。
