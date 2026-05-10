const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { BuildynoteClient } = require('../client/buildynote');
const work = require('../tools/work');
const gantt = require('../tools/gantt');
const schedule = require('../tools/schedule');
const master = require('../tools/master');

const apiToken = process.env.BUILDYNOTE_API_TOKEN;
if (!apiToken) {
  console.error('Error: BUILDYNOTE_API_TOKEN environment variable is required');
  process.exit(1);
}
const client = new BuildynoteClient(apiToken);

const TOOLS = [
  {
    name: 'work_list',
    description: 'BUILDYNOTEの仕事一覧を取得する。名前・ステータス・顧客IDで絞り込み可能。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '仕事名（部分一致）' },
        status: { type: 'string', description: 'ステータス（1=見込客, 2=受注, 3=完了）' },
        customer_id: { type: 'string', description: '顧客ID' },
      },
    },
  },
  {
    name: 'work_info',
    description: '指定した仕事IDの詳細情報を取得する。',
    inputSchema: {
      type: 'object',
      required: ['work_id'],
      properties: {
        work_id: { type: 'string', description: '仕事ID' },
      },
    },
  },
  {
    name: 'work_new',
    description: 'BUILDYNOTEに新しい仕事を作成する。',
    inputSchema: {
      type: 'object',
      required: ['name', 'customer_id', 'construction_type_id', 'sales_staff_id'],
      properties: {
        name: { type: 'string', description: '仕事名' },
        kana: { type: 'string', description: '仕事名（ふりがな）' },
        customer_id: { type: 'string', description: '顧客ID' },
        construction_type_id: { type: 'string', description: '物件区分ID' },
        sales_staff_id: { type: 'string', description: '営業担当ID' },
        manager_id: { type: 'string', description: '担当者ID' },
        overview: { type: 'string', description: '仕事概要（GitLab Issue URL等）' },
        foreign_id: { type: 'string', description: '外部連携ID（例: gitlab:14:3225）' },
        status: { type: 'string', description: 'ステータス（1=見込客）', default: '1' },
      },
    },
  },
  {
    name: 'work_edit',
    description: '既存の仕事を編集する。',
    inputSchema: {
      type: 'object',
      required: ['work_id'],
      properties: {
        work_id: { type: 'string', description: '仕事ID' },
        name: { type: 'string', description: '仕事名' },
        status: { type: 'string', description: 'ステータス' },
        overview: { type: 'string', description: '仕事概要' },
      },
    },
  },
  {
    name: 'gantt_list',
    description: '指定した仕事の工程一覧を取得する。',
    inputSchema: {
      type: 'object',
      required: ['work_id'],
      properties: {
        work_id: { type: 'string', description: '仕事ID（必須）' },
      },
    },
  },
  {
    name: 'gantt_new',
    description: '仕事に工程を新規作成する。category: 1=社内, 2=工事, 3=納材, 4=検査',
    inputSchema: {
      type: 'object',
      required: ['work_id', 'name', 'day_start', 'day_end'],
      properties: {
        work_id: { type: 'string', description: '仕事ID' },
        category: { type: 'string', description: '工程種別（1=社内/2=工事/3=納材/4=検査）', enum: ['1', '2', '3', '4'] },
        name: { type: 'string', description: '工程名' },
        day_start: { type: 'string', description: '開始日（YYYY-MM-DD）' },
        day_end: { type: 'string', description: '終了日（YYYY-MM-DD）' },
        industry_type_id: { type: 'string', description: '業種区分ID' },
        supplier_company_id: { type: 'string', description: '協力会社ID' },
        report_type: { type: 'string', description: '報告種別（1=なし, 2=報告リスト, 3=スライダー, 4=カスタム）' },
      },
    },
  },
  {
    name: 'gantt_edit',
    description: '工程を編集する。',
    inputSchema: {
      type: 'object',
      required: ['gantt_id'],
      properties: {
        gantt_id: { type: 'string', description: '工程ID' },
        name: { type: 'string', description: '工程名' },
        day_start: { type: 'string', description: '開始日（YYYY-MM-DD）' },
        day_end: { type: 'string', description: '終了日（YYYY-MM-DD）' },
      },
    },
  },
  {
    name: 'schedule_list',
    description: '個人予定の一覧を取得する。user_idは必須。先にmaster_staffで社員IDを取得してから呼ぶこと。',
    inputSchema: {
      type: 'object',
      required: ['user_id'],
      properties: {
        user_id: { type: 'string', description: '取得対象のユーザーID（master_staffで取得可能）' },
        schedule_date: { type: 'string', description: '取得開始日（YYYY-MM-DD）' },
        schedule_end_date: { type: 'string', description: '取得終了日（YYYY-MM-DD）。schedule_dateと合わせて範囲指定' },
        work_id: { type: 'string', description: '関連する仕事ID' },
      },
    },
  },
  {
    name: 'schedule_new',
    description: '個人予定を新規作成する。',
    inputSchema: {
      type: 'object',
      required: ['name', 'start_date', 'end_date'],
      properties: {
        name: { type: 'string', description: '予定名' },
        start_date: { type: 'string', description: '開始日時（YYYY-MM-DD または YYYY-MM-DD HH:mm）' },
        end_date: { type: 'string', description: '終了日時（YYYY-MM-DD または YYYY-MM-DD HH:mm）' },
        user_list: { type: 'array', items: { type: 'string' }, description: '参加者のユーザーIDリスト' },
        work_id: { type: 'string', description: '関連する仕事ID' },
        is_private: { type: 'string', description: '非公開フラグ（0=公開, 1=非公開）' },
        label_id: { type: 'string', description: 'ラベルID' },
      },
    },
  },
  {
    name: 'schedule_edit',
    description: '個人予定を編集する。',
    inputSchema: {
      type: 'object',
      required: ['schedule_id'],
      properties: {
        schedule_id: { type: 'string', description: '予定ID' },
        name: { type: 'string', description: '予定名' },
        start_date: { type: 'string', description: '開始日時' },
        end_date: { type: 'string', description: '終了日時' },
      },
    },
  },
  {
    name: 'schedule_delete',
    description: '個人予定を削除する。',
    inputSchema: {
      type: 'object',
      required: ['schedule_id'],
      properties: {
        schedule_id: { type: 'string', description: '削除する予定ID' },
      },
    },
  },
  {
    name: 'master_staff',
    description: '社員一覧を取得する。工程・仕事作成時のIDを確認するために使用する。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'master_construction_types',
    description: '物件区分の一覧を取得する。仕事作成時の construction_type_id を確認するために使用する。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'master_industry_types',
    description: '業種区分の一覧を取得する。工程作成時の industry_type_id を確認するために使用する。',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function handleTool(name, args) {
  switch (name) {
    case 'work_list':           return work.listWorks(client, args);
    case 'work_info':           return work.getWork(client, args);
    case 'work_new':            return work.createWork(client, args);
    case 'work_edit':           return work.editWork(client, args);
    case 'gantt_list':          return gantt.listGantts(client, args);
    case 'gantt_new':           return gantt.createGantt(client, args);
    case 'gantt_edit':          return gantt.editGantt(client, args);
    case 'schedule_list':       return schedule.listSchedules(client, args);
    case 'schedule_new':        return schedule.createSchedule(client, args);
    case 'schedule_edit':       return schedule.editSchedule(client, args);
    case 'schedule_delete':     return schedule.deleteSchedule(client, args);
    case 'master_staff':        return master.listStaff(client);
    case 'master_construction_types': return master.listConstructionTypes(client);
    case 'master_industry_types':     return master.listIndustryTypes(client);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

const server = new Server(
  { name: 'buildynote-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleTool(name, args || {});
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BUILDYNOTE MCP server running (stdio)');
}

main().catch((e) => { console.error(e); process.exit(1); });
