# MCP 接続ガイド

OpenTax は同じ MCP ツールを 2 つの方法で提供します。

- **リモート MCP**: `https://<あなたのOpenTax>/api/mcp`（Streamable HTTP、OAuth 2.1）。Web・モバイルの Claude や ChatGPT のチャットなど、URL で接続するホスト向けです。
- **stdio アダプター**: `packages/opentax-mcp`。Claude Code、Codex、Claude Desktop のローカル設定など、ローカルプロセスを起動するホスト向けです。

ツール定義は `packages/opentax-mcp/tools.ts` にあり、両方で共有しているため食い違いは生じません。どちらも LLM の呼び出し、CSV の解析、OCR、勘定科目の分類は行いません。すべてのツール呼び出しはエージェント自身のトークンで通常の OpenTax API を経由するため、スコープの確認・確認待ち仕訳のルール・監査は Web と同じです。

## リモート MCP（Claude・ChatGPT）

サーバー URL は `/agent-connections`（**Agent接続** 画面）に表示されます。

- **Claude**（claude.ai・デスクトップ・モバイル）: 設定 → コネクタ → カスタムコネクタを追加 → URL を貼り付け
- **ChatGPT**: 設定 → アプリとコネクタ → 詳細設定 → 開発者モードを有効化 → 作成 → URL を貼り付けて OAuth を選択。書き込み系ツールには開発者モードが必要で、ワークスペースの管理者が制限している場合があります。
- **その他のホスト**: ヘッダーを設定できる場合は OAuth を使わず、`/agent-connections` で作成したトークンを `Authorization: Bearer otk_...` として送信できます。

コネクタを追加すると、ホストが OpenTax の同意画面（`/oauth/authorize`）を開きます。サインインしてスコープを選び、許可してください。許可した接続は `/agent-connections` に **OAuth** バッジ付きで表示され、そこで取り消すと即座に接続が切れます（アクセストークン・リフレッシュトークンともに無効になります）。

### しくみ

| 構成要素 | 場所 |
| --- | --- |
| MCP エンドポイント（Streamable HTTP 2026-07-28、ステートレスな 2025 版へのフォールバックあり） | `app/api/mcp/route.ts`, `lib/mcp/handler.ts` |
| Protected Resource Metadata（RFC 9728） | `/.well-known/oauth-protected-resource[/api/mcp]` |
| Authorization Server Metadata（RFC 8414） | `/.well-known/oauth-authorization-server`（`/.well-known/openid-configuration` も同じ） |
| 動的クライアント登録（RFC 7591） | `POST /api/oauth/register` |
| 同意画面 | `/oauth/authorize` → `/api/oauth/authorize` |
| トークン発行・失効 | `POST /api/oauth/token`, `POST /api/oauth/revoke` |
| 許可情報の保存と検証 | `lib/auth/oauth.ts` |

- 認可コード + PKCE（S256 のみ）。認可コードの有効期限は 5 分で、一度しか使えません。
- アクセストークン（`ota_`）の有効期限は 1 時間、リフレッシュトークン（`otr_`）は 30 日で、使うたびにローテーションします。保存するのは SHA-256 ハッシュのみです（Firestore の `oauthTokens`・`oauthCodes`・`oauthClients`）。
- （ユーザー, クライアント）の組ごとに 1 つのエージェント接続になります。実際に有効なスコープは、トークンのスコープと接続の現在のスコープの共通部分です。
- リダイレクト URI は HTTPS 必須（ループバックのみ HTTP 可）で、登録済みの URI と完全一致する必要があります（ループバックのポート番号は可変）。
- `/api/mcp` はエージェントトークン（`ota_`・`otk_`）のみ受け付けます。Firebase のユーザーセッションはスコープを持たないため拒否します。
- リモートの `upload_evidence` はローカルパスの代わりに `filename` と `content_base64` を受け取ります。Vercel ではリクエストボディが 4.5 MB に制限されるため、リモート経由のアップロードはファイル本体で約 3 MB までです。大きなファイルは stdio アダプターを使ってください。

### デプロイ時の注意

- 複数のホスト名でアクセスできる場合は、issuer と resource の URL を固定するために `OPENTAX_PUBLIC_URL`（例: `https://opentax.example.com`）を設定してください。未設定の場合はリクエストのオリジンを使います。
- 推奨: `oauthCodes.expiresAt` と `oauthTokens.expiresAt` に Firestore の TTL ポリシーを設定し、期限切れの行を自動削除します。
- 登録エンドポイントは、MCP ホストの要件により認証なしで公開されます。濫用が懸念される場合は、エッジで `/api/oauth/*` にレート制限をかけてください（例: Vercel Firewall のルール）。

## stdio アダプター

### セットアップ

先に OpenTax を起動しておきます（`npm run mcp:build` で MCP の実行ファイルをビルドします）。`/agent-connections` で `read` と必要な書き込みスコープを持つ接続を作成し、表示されたトークンをコピーします。トークンは後から再表示できません。エージェントの MCP 設定にサーバー URL とトークンを設定します。

```bash
export OPENTAX_BASE_URL=https://your-opentax.example.com
export OPENTAX_AGENT_TOKEN=otk_your_one_time_token
npm run mcp:start
```

ローカル開発では `http://localhost:3000` を使えます。それ以外の HTTPS でない URL は拒否されます。トークンが別のホストに転送されないよう、リダイレクトも拒否します。

#### Claude Code

リポジトリのルートで次を実行します。

```bash
claude mcp add --env OPENTAX_BASE_URL=https://your-opentax.example.com --env OPENTAX_AGENT_TOKEN=otk_your_one_time_token --transport stdio opentax -- node /absolute/path/to/opentax/packages/opentax-mcp/dist/server.mjs
```

#### Codex

Codex の設定に MCP サーバーを追加します（リポジトリの絶対パスは環境に合わせて変更してください）。

```toml
[mcp_servers.opentax]
command = "node"
args = ["/absolute/path/to/opentax/packages/opentax-mcp/dist/server.mjs"]
[mcp_servers.opentax.env]
OPENTAX_BASE_URL = "https://your-opentax.example.com"
OPENTAX_AGENT_TOKEN = "otk_your_one_time_token"
```

最新のホスト設定は [Claude Code の MCP ガイド](https://code.claude.com/docs/en/mcp) と [Codex の MCP ガイド](https://developers.openai.com/codex/mcp) を参照してください。トークンを含む設定ファイルは他人と共有しないでください。トークンを紛失・漏えいした場合は `/agent-connections` から取り消してください。

## ツール一覧

| 分野 | ツール |
| --- | --- |
| 事業情報 | `get_business_context`, `update_business_settings` |
| 取引先 | `search_customers`, `create_customer`, `update_customer` |
| 案件 | `search_projects`, `get_project`, `create_project`, `update_project` |
| 仕訳 | `search_journals`, `create_journals`, `update_pending_journal`, `delete_pending_journal`, `update_journal_links` |
| 証憑 | `upload_evidence`, `search_evidence`, `update_evidence`, `delete_evidence` |
| 請求書類 | `search_billing_documents`, `get_billing_document`, `create_billing_draft`, `update_billing_draft`, `delete_billing_draft` |
| 固定資産 | `list_fixed_assets`, `create_fixed_asset`, `update_fixed_asset` |
| レポート | `get_profit_and_loss`, `get_balance_sheet`, `get_monthly_summary`, `get_tax_return_preview` |

`create_journals` は最大 200 件を受け付け、1 件ごとに結果を返します。再試行する場合は安定した `idempotencyKey` を指定してください。一部の失敗が成功分を隠すことはありません。エージェントが登録した仕訳は確認待ちのままで、MCP から確定することはできません。`/review` で確定してください。

### 編集・削除・紐付けの変更

| 操作 | API | スコープ | エージェントの制限 |
| --- | --- | --- | --- |
| 証憑のメタデータ編集 | `PATCH /api/documents` `{ documentId, updates }` | `evidence:write` | — |
| 証憑の削除 | `DELETE /api/documents` `{ documentId, reason }` | `evidence:write` | 仕訳に紐付いている間は拒否（`409 EVIDENCE_LINKED`）。論理削除で、保存済みファイルは残ります。 |
| 仕訳の紐付け変更 | `PUT /api/journals/links` `{ journalId, evidenceIds?, issuedDocumentId?, reason }` | `journals:write` | 確定済みの仕訳には追加のみ可能（`409 CONFIRMED_JOURNAL`）。 |
| 請求書類の編集（案件の変更を含む） | `PATCH /api/issued-documents` `{ documentId, updates }` | `billing:write` | 下書きのみ。`projectId` を変更すると取引先情報も更新されます。 |
| 請求書類の削除 | `DELETE /api/issued-documents` `{ documentId }` | `billing:write` | 会計に転記していない下書きのみ（`409 NOT_DRAFT`）。 |
| 事業設定の編集 | `PATCH /api/settings` `{ updates }` | `settings:write` | `bankAccounts` はユーザーのみ変更可（`403 FIELD_DENIED`）。未知のフィールドは拒否されます。 |

紐付けは双方向で保持されます: `journal.evidenceIds` ⇄ `document.linkedJournalIds`、`journal.sourceDocumentId` ⇄ `issuedDocument.linkedJournalIds`。請求書類から最後の仕訳の紐付けが外れる（または削除される）と `postedToAccounting` がリセットされ、再度転記できるようになります。すべての変更は監査ログに記録されます。既存の接続には `settings:write` が自動では付与されません。このスコープが必要な場合は `/agent-connections` で新しい接続を作成する（または OAuth コネクタを再接続する）必要があります。

stdio アダプターの `upload_evidence` は、ローカルにある最大 10 MB の PDF・JPEG・PNG の通常ファイルを受け付けます。MCP プロセスはファイル名（ベース名のみ）とともにマルチパートでアップロードし、ファイルの内容をモデルのプロンプトに含めることはありません。
