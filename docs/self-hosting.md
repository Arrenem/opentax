# セルフホストガイド

OpenTax は、ご自身の Firebase プロジェクトと Next.js を動かせる環境があれば、自分専用の会計環境として動かせます。データはすべてご自身の Firebase に保存されます。

`npm run setup` は計画作成と工程ごとの同意付き構築へ進みます（開発中・実クラウド未検証）。[セットアップと所有者制限](setup-wizard.md)を参照してください。

## 必要なもの

- Node.js 22 以上
- Firebase プロジェクト（Authentication・Firestore・Cloud Storage を有効化）
- Firebase Admin SDK 用の認証情報（サービスアカウント鍵、または Application Default Credentials）
- Next.js を動かせるホスティング環境（ローカル、Vercel、Cloud Run など）

## 1. リポジトリの取得

```bash
git clone https://github.com/arrenem/opentax.git
cd opentax
npm install
```

## 2. Firebase プロジェクトの準備

1. [Firebase コンソール](https://console.firebase.google.com/) でプロジェクトを作成します。
2. **Firestore** を作成します（ロケーションは `asia-northeast1` など、利用者に近いリージョンを推奨）。
3. **Cloud Storage** を有効にします。Blaze と課金アカウント紐付けが必要です。無料枠は無料保証ではなく、費用・地域を本人が確認してください。
4. **Authentication** で、使うサインイン方法（メール/パスワード、Google など）を有効にし、**承認済みドメイン** に OpenTax を公開するドメインを追加します。
5. プロジェクト設定から **Web アプリ** を追加し、表示される設定値を控えます。

> [!WARNING]
> 個人環境では `OPENTAX_ACCESS_MODE=owner` と `OPENTAX_OWNER_UID` を設定して API/MCP を本人に制限してください。UID 未設定の owner モードは全員を拒否します。既存の未設定環境は従来の UID 分離を維持します。Firebase 自体の登録制御は別です。匿名認証を無効にし、必要な認証プロバイダ・承認済みドメインに限定してください。[互換性・移行手順](setup-wizard.md)を参照してください。

## 3. 環境変数の設定

```bash
cp .env.local.example .env.local
```

| 変数 | 必須 | 説明 |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` | ✓ | Firebase Web アプリの設定値 |
| `FIREBASE_ADMIN_PROJECT_ID` | ✓ | Firebase のプロジェクト ID |
| `FIREBASE_ADMIN_CLIENT_EMAIL` / `FIREBASE_ADMIN_PRIVATE_KEY` | | サービスアカウントの値。省略すると Application Default Credentials を使用 |
| `OPENTAX_ACCESS_MODE` / `OPENTAX_OWNER_UID` | 個人用環境 | `owner` と本人 UID。未設定の既存環境は互換動作を維持 |
| `NTA_APP_ID` | | 国税庁インボイス公表サイト Web-API のアプリケーション ID（登録番号の照合にのみ使用） |
| `OPENTAX_PUBLIC_URL` | | 複数のホスト名で公開する場合に OAuth の issuer / resource URL を固定する公開 URL |

`.env.local` とサービスアカウント鍵は絶対にコミットしないでください（`.gitignore` で除外済みです）。

## 4. ルールとインデックスのデプロイ

```bash
cp .firebaserc.example .firebaserc   # "your-firebase-project-id" を自分の ID に書き換え
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```

リポジトリのルールは、クライアントからの Firestore / Storage への直接アクセスをすべて拒否します。データへのアクセスは、リクエストを認証・認可した Next.js サーバーが Admin SDK 経由でのみ行います。

推奨: `oauthCodes.expiresAt` と `oauthTokens.expiresAt` に Firestore の TTL ポリシーを設定すると、期限切れのデータが自動で削除されます。

## 5. 起動

```bash
npm run dev              # 開発サーバー（http://localhost:3000）
npm run build && npm start   # 本番ビルド
```

開発環境（`NODE_ENV !== 'production'`）では、`test@example.com` / `test1234` でサインインすると、ネットワーク不要のテストモードで画面を確認できます。本番ビルドでは無効です。

## 6. 公開時の注意

- HTTPS で公開してください。エージェント接続は、ローカル開発用の `http://localhost` を除き HTTPS のみ受け付けます。
- リモート MCP の動的クライアント登録（`POST /api/oauth/register`）は MCP の仕様上、認証なしで呼び出せます。必要に応じて、ホスティング側のファイアウォールで `/api/oauth/*` にレート制限をかけてください。
- Vercel などリクエストボディに上限があるホスティングでは、リモート MCP 経由の証憑アップロードにサイズ制限がかかります（Vercel では約 3 MB）。大きなファイルは stdio アダプター経由でアップロードしてください。

次のステップ: [MCP 接続ガイド](mcp.md) でエージェントをつなぎます。
