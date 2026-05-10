# buildynote-mcp 構築記録

作成日: 2026-05-10

## 何を作ったか

BUILDYNOTEの仕事・工程・個人予定を、Claude・Manus・Gemini等のAIエージェントから自然言語で操作できるサーバー。

---

## 構成

```
buildynote-mcp/
├── src/
│   ├── client/buildynote.js   # BUILDYNOTE APIクライアント（共通通信層）
│   ├── tools/
│   │   ├── work.js            # 仕事CRUD
│   │   ├── gantt.js           # 工程CRUD
│   │   ├── schedule.js        # 個人予定CRUD
│   │   └── master.js          # マスターデータ（社員・物件区分・業種区分）
│   ├── rest/server.js         # Express REST APIサーバー（ポート3000）
│   └── mcp/server.js          # MCP stdioサーバー（Claude向け）
├── openapi.yaml               # REST API仕様書
├── railway.toml               # Railwayデプロイ設定
└── README.md                  # セットアップ手順
```

---

## 起動方法

```bash
cd C:\Users\kurod\BuildynoteProject\buildynote-mcp

# REST APIサーバー（Manus・Gemini等向け）
node src/rest/server.js

# MCPサーバー（Claude向け、通常はClaude Codeが自動起動）
node src/mcp/server.js
```

---

## 使えるエンドポイント（REST）

| メソッド | URL | 機能 |
|--------|-----|------|
| GET | /works | 仕事一覧 |
| GET | /works/:id | 仕事詳細 |
| POST | /works | 仕事作成 |
| PUT | /works/:id | 仕事編集 |
| GET | /works/:id/gantt | 工程一覧 |
| POST | /works/:id/gantt | 工程作成 |
| GET | /schedules | 個人予定一覧 |
| POST | /schedules | 個人予定作成 |
| PUT | /schedules/:id | 個人予定編集 |
| DELETE | /schedules/:id | 個人予定削除 |
| GET | /masters/staff | 社員一覧 |
| GET | /masters/construction-types | 物件区分一覧 |
| GET | /masters/industry-types | 業種区分一覧 |

認証: `X-Api-Token: {BUILDYNOTEのAPIトークン}` ヘッダー

---

## Claude Codeへの登録方法

```bash
claude mcp add buildynote -s user \
  -e BUILDYNOTE_API_TOKEN=<トークン> \
  -- node "C:/Users/kurod/BuildynoteProject/buildynote-mcp/src/mcp/server.js"
```

登録後、**Claude Codeを再起動**するとMCPツールが有効になる。

---

## MCPツール一覧（Claude向け）

| ツール名 | 機能 |
|---------|------|
| work_list | 仕事一覧（name/status/customer_idで絞り込み） |
| work_info | 仕事詳細 |
| work_new | 仕事作成 |
| work_edit | 仕事編集 |
| gantt_list | 工程一覧（work_id必須） |
| gantt_new | 工程作成 |
| gantt_edit | 工程編集 |
| schedule_list | 個人予定一覧 |
| schedule_new | 個人予定作成 |
| schedule_edit | 個人予定編集 |
| schedule_delete | 個人予定削除 |
| master_staff | 社員一覧 |
| master_construction_types | 物件区分一覧 |
| master_industry_types | 業種区分一覧 |

---

## 重要な技術メモ

### BUILDYNOTE APIのtypeコードについて
- `G002-001` 等のGコードは**使えない**（"要求タイプが存在しません"エラー）
- 正しいtypeは: `work_list`, `gantt_list`, `schedule_list`, `user_list`, `construction_type_list`, `industry_type_list` 等

### 認証
- REST API: リクエストごとに `X-Api-Token` ヘッダーでトークンを渡す
- MCP: 環境変数 `BUILDYNOTE_API_TOKEN` で起動時に設定

---

## 次のステップ（未対応）

- [ ] Railwayへのクラウドデプロイ（他ユーザーへのREST API提供）
- [ ] schedule_list の user_id 自動解決（現状は呼び出し側で指定が必要）
