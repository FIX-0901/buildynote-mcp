# buildynote-mcp

BUILDYNOTEの仕事・工程・個人予定をAIエージェントから操作できるサーバー。

- **MCP サーバー** — Claude Code / Claude Desktop から自然言語で操作（stdio）
- **REST API** — Manus / Gemini / ChatWork AI 等、あらゆるAIエージェントから操作（HTTP）

## セットアップ

```bash
npm install
```

## 使い方

### A. Claude Code（MCP）

`.claude/settings.json` に追記:

```json
{
  "mcpServers": {
    "buildynote": {
      "command": "node",
      "args": ["/path/to/buildynote-mcp/src/mcp/server.js"],
      "env": {
        "BUILDYNOTE_API_TOKEN": "自分のBUILDYNOTEトークン"
      }
    }
  }
}
```

Claude Code を再起動後、`/mcp` で登録確認。

### B. REST API（Manus / Gemini / その他）

```bash
# ローカル起動
node src/rest/server.js

# Railway 等クラウドにデプロイ後
# ベースURL: https://your-app.railway.app
# 認証: X-Api-Token ヘッダーに自分のBUILDYNOTEトークンをセット
```

**PowerShell でのテスト例:**

```powershell
$h = @{ "X-Api-Token" = "your_token" }

# 社員一覧
Invoke-RestMethod http://localhost:3000/masters/staff -Headers $h

# 仕事一覧
Invoke-RestMethod http://localhost:3000/works -Headers $h

# 仕事作成
$body = @{ name="テスト仕事"; customer_id="741"; construction_type_id="311"; sales_staff_id="277" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri http://localhost:3000/works -Headers $h -Body $body -ContentType "application/json"

# 工程作成
$body = @{ name="設計工程"; category="1"; day_start="2026-06-01"; day_end="2026-06-30" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri http://localhost:3000/works/371080/gantt -Headers $h -Body $body -ContentType "application/json"

# 個人予定作成
$body = @{ name="定例MTG"; start_date="2026-06-01 10:00"; end_date="2026-06-01 11:00" } | ConvertTo-Json
Invoke-RestMethod -Method POST -Uri http://localhost:3000/schedules -Headers $h -Body $body -ContentType "application/json"
```

API仕様書: `http://localhost:3000/openapi.yaml`

## Railway デプロイ

1. このフォルダを GitHub リポジトリとして push
2. Railway → New Project → Deploy from GitHub
3. Root Directory を `buildynote-mcp/` に設定
4. 環境変数は不要（各ユーザーが X-Api-Token ヘッダーで渡す）

## 利用可能なMCPツール

| ツール | 説明 |
|--------|------|
| `work_list` | 仕事一覧（name/status/customer_idで絞り込み） |
| `work_info` | 仕事詳細 |
| `work_new` | 仕事作成 |
| `work_edit` | 仕事編集 |
| `gantt_list` | 工程一覧（work_id必須） |
| `gantt_new` | 工程作成 |
| `gantt_edit` | 工程編集 |
| `schedule_list` | 個人予定一覧 |
| `schedule_new` | 個人予定作成 |
| `schedule_edit` | 個人予定編集 |
| `schedule_delete` | 個人予定削除 |
| `master_staff` | 社員一覧 |
| `master_construction_types` | 物件区分一覧 |
| `master_industry_types` | 業種区分一覧 |
