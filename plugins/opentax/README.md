# OpenTax プラグイン

Agent Plugins 1.0 形式のパッケージです。OpenTax の Streamable HTTP MCP サーバーに接続し、OpenTax を使った会計作業のためのスキル（`skills/opentax-accounting`）を提供します。

## 使う前に

`mcp.json` の `url` は仮の値（`https://your-opentax.example.com/api/mcp`）になっています。パッケージ化する前に、ご自身がセルフホストしている OpenTax の HTTPS の `/api/mcp` エンドポイントに書き換えてください。

## 接続

MCP サーバーは OAuth を使います。プラグインをインストールしたら OpenTax アカウントに接続し、`read` と作業に必要な最小限の書き込みスコープだけを許可してください。許可した接続は OpenTax の **Agent接続** 画面で確認・取り消しできます。このパッケージには認証情報は含まれていません。

ツールの一覧と動作の詳細は、このリポジトリの `packages/opentax-mcp/tools.ts` と [MCP 接続ガイド](../../docs/mcp.md) を参照してください。

> スキル本文（`SKILL.md`）はエージェントへの指示として英語で記述しています。
