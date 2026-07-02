const work = require('../tools/work');
const gantt = require('../tools/gantt');
const schedule = require('../tools/schedule');
const master = require('../tools/master');
const customer = require('../tools/customer');
const office = require('../tools/office');
const department = require('../tools/department');
const position = require('../tools/position');
const propertyType = require('../tools/propertyType');
const company = require('../tools/company');

function simpleMasterTools(toolPrefix, label, idField, idsField) {
  return [
    {
      name: `${toolPrefix}_list`,
      description: `${label}の一覧を取得する。`,
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'ページ番号' },
          limit: { type: 'string', description: '取得件数（デフォルト50、最大1000）' },
          q: { type: 'string', description: '検索クエリ（任意）' },
        },
      },
    },
    {
      name: `${toolPrefix}_info`,
      description: `指定IDの${label}の詳細を取得する。`,
      inputSchema: {
        type: 'object',
        required: [idField],
        properties: { [idField]: { type: 'string', description: `${label}ID` } },
      },
    },
    {
      name: `${toolPrefix}_info_multi`,
      description: `複数の${label}の詳細を一括取得する。${idsField} はカンマ区切り（例: "1,3,5"）。`,
      inputSchema: {
        type: 'object',
        required: [idsField],
        properties: { [idsField]: { type: 'string', description: `${label}IDのカンマ区切り` } },
      },
    },
    {
      name: `${toolPrefix}_new`,
      description: `${label}を新規作成する。name は必須、foreign_id は任意。`,
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: `${label}名` },
          foreign_id: { type: 'string', description: '外部ID（任意）' },
        },
      },
    },
    {
      name: `${toolPrefix}_edit`,
      description: `既存の${label}を編集する。`,
      inputSchema: {
        type: 'object',
        required: [idField, 'name'],
        properties: {
          [idField]: { type: 'string', description: `${label}ID` },
          name: { type: 'string', description: `${label}名` },
          foreign_id: { type: 'string', description: '外部ID（任意）' },
        },
      },
    },
    {
      name: `${toolPrefix}_delete`,
      description: `${label}を削除する。`,
      inputSchema: {
        type: 'object',
        required: [idField],
        properties: { [idField]: { type: 'string', description: `${label}ID` } },
      },
    },
  ];
}

// 受注担当者(supplier_user)/発注担当者(order_user) の配列スキーマ。
// supplier_user は is_chief=1 の責任者を1人以上含める必要がある（無いと先頭が自動で責任者になる）。
const SUPPLIER_USER_SCHEMA = {
  type: 'array',
  description: '受注担当者の配列。各要素 {user_id, is_chief}。指定する場合は supplier_company_id が必須で、責任者(is_chief=1)を1人以上含める（未指定なら先頭を責任者に自動設定）。自社社員のみなら supplier_company_id は自動補完される。',
  items: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
      is_chief: { type: 'string', enum: ['0', '1'], description: '1=責任者' },
    },
  },
};
const ORDER_USER_SCHEMA = {
  type: 'array',
  description: '発注担当者の配列。各要素 {user_id, is_chief}。',
  items: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
      is_chief: { type: 'string', enum: ['0', '1'], description: '1=責任者' },
    },
  },
};
// 実施会社(constructor)の担当者配列。supplier と同じく責任者(is_chief=1)が1人必須（未指定なら先頭を自動設定）。
// constructor_company_id は自社社員のみなら自動補完される。指定すると is_constructor=1 が自動付与される。
const CONSTRUCTOR_USER_SCHEMA = {
  type: 'array',
  description: '実施会社の担当者の配列。各要素 {user_id, is_chief}。constructor_company_id が必須（自社社員のみなら自動補完）。責任者(is_chief=1)を1人以上含める（未指定なら先頭を自動設定）。指定すると is_constructor=1 が自動で付く。',
  items: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
      is_chief: { type: 'string', enum: ['0', '1'], description: '1=責任者' },
    },
  },
};
// 関係会社(other_company)。会社IDや責任者は不要で、ユーザー配列だけ渡す（所属会社はBN本体がDB逆引きする）。
const OTHER_COMPANY_SCHEMA = {
  type: 'array',
  description: '関係会社の担当者の配列。各要素 {user_id}。会社ID・責任者の指定は不要（所属会社は自動判定）。',
  items: {
    type: 'object',
    required: ['user_id'],
    properties: {
      user_id: { type: 'string' },
    },
  },
};

const TOOLS = [
  // ============ 仕事 ============
  {
    name: 'work_list',
    description: 'BUILDYNOTEの仕事一覧を取得する。名前・ステータス・顧客ID・物件区分IDで絞り込み可能。sort=descで新しいもの順。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '仕事名（部分一致）' },
        status: { type: 'string', description: 'ステータス（1=見込客, 2=受注, 3=完了）' },
        customer_id: { type: 'string', description: '顧客ID' },
        construction_type_id: { type: 'string', description: '物件区分ID（例: 311=Buildynoteシステム開発#issue）' },
        sort: { type: 'string', description: '並び順。desc/updated_descで更新日の新しい順', enum: ['desc', 'updated_desc'] },
        limit: { type: 'string', description: '取得件数（デフォルト50、最大1000）' },
        page: { type: 'string', description: 'ページ番号（sort未指定時のみ有効）' },
      },
    },
  },
  {
    name: 'work_info',
    description: '指定した仕事IDの詳細情報を取得する。',
    inputSchema: { type: 'object', required: ['work_id'], properties: { work_id: { type: 'string' } } },
  },
  {
    name: 'work_info_multi',
    description: '複数の仕事詳細を一括取得する。work_idsはカンマ区切り（例: "1,3,5"）。',
    inputSchema: { type: 'object', required: ['work_ids'], properties: { work_ids: { type: 'string', description: '仕事IDのカンマ区切り' } } },
  },
  {
    name: 'work_new',
    description: 'BUILDYNOTEに新しい仕事を作成する。name と kana は必須。',
    inputSchema: {
      type: 'object',
      required: ['name', 'kana'],
      properties: {
        name: { type: 'string', description: '仕事名（必須）' },
        kana: { type: 'string', description: '仕事名ふりがな（必須）' },
        customer_id: { type: 'string', description: '顧客ID' },
        construction_type_id: { type: 'string', description: '物件区分ID' },
        sales_staff_id: { type: 'string', description: '営業担当ID' },
        manager_id: { type: 'string', description: '担当者ID' },
        overview: { type: 'string', description: '仕事概要（GitLab Issue URL等）' },
        foreign_id: { type: 'string', description: '外部連携ID' },
        status: { type: 'string', description: 'ステータス（1=見込客）' },
      },
    },
  },
  {
    name: 'work_edit',
    description: '既存の仕事を編集する。name と kana は必須。',
    inputSchema: {
      type: 'object',
      required: ['work_id', 'name', 'kana'],
      properties: {
        work_id: { type: 'string' },
        name: { type: 'string' },
        kana: { type: 'string' },
        status: { type: 'string' },
        overview: { type: 'string' },
      },
    },
  },
  {
    name: 'work_delete',
    description: '仕事を削除する。',
    inputSchema: { type: 'object', required: ['work_id'], properties: { work_id: { type: 'string' } } },
  },

  // ============ 工程（ガント） ============
  {
    name: 'gantt_list',
    description: '指定した仕事の工程一覧を取得する。start_date/end_date を指定すると「その期間に重なる工程」を全件返す（開始・終了が期間外にはみ出す長期工程も期間に重なれば含む。期間またぎ漏れ・50件キャップはMCP側で解消済み）。日付未指定なら全期間。',
    inputSchema: {
      type: 'object',
      required: ['work_id'],
      properties: {
        work_id: { type: 'string', description: '仕事ID（必須）' },
        start_date: { type: 'string', description: '取得開始日時（YYYY-MM-DD または YYYY-MM-DDTHH:mm:ss）' },
        end_date: { type: 'string', description: '取得終了日時' },
      },
    },
  },
  {
    name: 'gantt_info',
    description: '指定した工程IDの詳細を取得する。',
    inputSchema: { type: 'object', required: ['gantt_id'], properties: { gantt_id: { type: 'string', description: '工程ID（APIではschedule_idと呼ばれる）' } } },
  },
  {
    name: 'gantt_info_multi',
    description: '複数の工程詳細を一括取得する。schedule_idsはカンマ区切り。',
    inputSchema: { type: 'object', required: ['schedule_ids'], properties: { schedule_ids: { type: 'string', description: '工程IDのカンマ区切り' } } },
  },
  {
    name: 'gantt_new',
    description: '仕事に工程を新規作成する。category: 1=社内, 2=工事, 3=納材, 4=検査。受注担当者を入れるなら supplier_user に配列で指定（supplier_company_id・責任者is_chief=1 が必須。自社社員のみなら会社IDは自動補完）。',
    inputSchema: {
      type: 'object',
      required: ['work_id', 'category', 'name', 'day_start', 'day_end', 'status'],
      properties: {
        work_id: { type: 'string' },
        category: { type: 'string', enum: ['1', '2', '3', '4'] },
        name: { type: 'string' },
        day_start: { type: 'string', description: 'YYYY-MM-DD' },
        day_end: { type: 'string', description: 'YYYY-MM-DD' },
        status: { type: 'string', description: '1=公開保存/2=下書き/3=全体調整中/4=停止中', enum: ['1', '2', '3', '4'] },
        industry_type_id: { type: 'string' },
        supplier_company_id: { type: 'string', description: '受注会社ID。supplier_user指定時は必須（未指定でも受注担当者が全員自社社員なら自動補完）。協力会社の場合は company_list で会社IDを調べて指定する。' },
        supplier_user: SUPPLIER_USER_SCHEMA,
        order_user: ORDER_USER_SCHEMA,
        constructor_company_id: { type: 'string', description: '実施会社ID。constructor_user指定時に使う（未指定でも担当者が全員自社社員なら自動補完）。' },
        constructor_user: CONSTRUCTOR_USER_SCHEMA,
        other_company: OTHER_COMPANY_SCHEMA,
        report_type: { type: 'string', description: '報告種別（1=なし, 2=報告リスト, 3=スライダー, 4=カスタム）' },
      },
    },
  },
  {
    name: 'gantt_edit',
    description: '工程を編集する。gantt_id と work_id は必須。受注担当者を変えるなら supplier_user、実施会社を変えるなら constructor_user、関係会社を変えるなら other_company に配列で指定（いずれも責任者is_chief=1 は自動保証。自社社員のみなら会社IDは自動補完）。これらを指定しない編集では既存値が保全される。',
    inputSchema: {
      type: 'object',
      required: ['gantt_id', 'work_id'],
      properties: {
        gantt_id: { type: 'string' },
        work_id: { type: 'string' },
        status: { type: 'string', enum: ['1', '2', '3', '4'] },
        name: { type: 'string' },
        day_start: { type: 'string' },
        day_end: { type: 'string' },
        category: { type: 'string', description: '1=社内/2=工事/3=納材/4=検査（省略時は既存値を維持）', enum: ['1', '2', '3', '4'] },
        industry_type_id: { type: 'string' },
        supplier_company_id: { type: 'string', description: '受注会社ID。supplier_user指定時は必須（未指定でも受注担当者が全員自社社員なら自動補完）。' },
        supplier_user: SUPPLIER_USER_SCHEMA,
        order_user: ORDER_USER_SCHEMA,
        constructor_company_id: { type: 'string', description: '実施会社ID。constructor_user指定時に使う（未指定でも担当者が全員自社社員なら自動補完）。' },
        constructor_user: CONSTRUCTOR_USER_SCHEMA,
        other_company: OTHER_COMPANY_SCHEMA,
      },
    },
  },
  {
    name: 'gantt_edit_multi',
    description: '複数工程を一括編集する。work_id・status・gantts配列が必須。各gantts要素はschedule_id等を持つ。受注担当者を変えるなら各要素に supplier_user を指定（supplier_company_id・責任者is_chief=1 が必須。自社社員のみなら会社IDは自動補完）。',
    inputSchema: {
      type: 'object',
      required: ['work_id', 'status', 'gantts'],
      properties: {
        work_id: { type: 'string' },
        status: { type: 'string', enum: ['1', '2', '3', '4'] },
        gantts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              schedule_id: { type: 'string' },
              name: { type: 'string' },
              day_start: { type: 'string' },
              day_end: { type: 'string' },
              category: { type: 'string', enum: ['1', '2', '3', '4'] },
              supplier_company_id: { type: 'string', description: '受注会社ID。supplier_user指定時は必須（自社社員のみなら自動補完）。' },
              supplier_user: SUPPLIER_USER_SCHEMA,
              delete_flag: { type: 'string', description: '1で削除' },
            },
          },
        },
      },
    },
  },

  // ============ 個人予定 ============
  {
    name: 'schedule_list',
    description: '個人予定の一覧を取得する。user_idは必須。日付はYYYY-MM-DDでも可。',
    inputSchema: {
      type: 'object',
      required: ['user_id'],
      properties: {
        user_id: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        work_id: { type: 'string' },
      },
    },
  },
  {
    name: 'schedule_info',
    description: '指定した予定IDの詳細を取得する。',
    inputSchema: { type: 'object', required: ['schedule_id'], properties: { schedule_id: { type: 'string' } } },
  },
  {
    name: 'schedule_info_multi',
    description: '複数の予定詳細を一括取得する。schedule_idsはカンマ区切り。',
    inputSchema: { type: 'object', required: ['schedule_ids'], properties: { schedule_ids: { type: 'string' } } },
  },
  {
    name: 'schedule_new',
    description: '個人予定を新規作成する。日付はYYYY-MM-DD、時刻はHH:mmで別フィールド。user_listに参加者(user_id)を指定。操作トークン本人を含めると後で本人が削除できる。',
    inputSchema: {
      type: 'object',
      required: ['name', 'start_date', 'end_date', 'user_list'],
      properties: {
        name: { type: 'string' },
        start_date: { type: 'string' },
        start_time: { type: 'string' },
        end_date: { type: 'string' },
        end_time: { type: 'string' },
        user_list: {
          type: 'array',
          items: { type: 'object', properties: { user_id: { type: 'string' } } },
          description: '参加者リスト（例: [{user_id: "277"}]）',
        },
        work_id: { type: 'string' },
        label_id: { type: 'string' },
      },
    },
  },
  {
    name: 'schedule_edit',
    description: '個人予定を編集する。is_regularは省略可（デフォルト0）。',
    inputSchema: {
      type: 'object',
      required: ['schedule_id', 'name', 'start_date', 'end_date', 'user_list'],
      properties: {
        schedule_id: { type: 'string' },
        name: { type: 'string' },
        start_date: { type: 'string' },
        start_time: { type: 'string' },
        end_date: { type: 'string' },
        end_time: { type: 'string' },
        user_list: { type: 'array', items: { type: 'object', properties: { user_id: { type: 'string' } } } },
        work_id: { type: 'string' },
      },
    },
  },
  {
    name: 'schedule_delete',
    description: '個人予定を削除する。',
    inputSchema: { type: 'object', required: ['schedule_id'], properties: { schedule_id: { type: 'string' } } },
  },

  // ============ 社員マスタ ============
  {
    name: 'master_staff',
    description: '社員一覧（ID・名前のみの軽量版）を取得する。',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'master_staff_info',
    description: '指定した社員の詳細（支社・部署・役職・メール・電話を含む）を取得する。',
    inputSchema: { type: 'object', required: ['user_id'], properties: { user_id: { type: 'string' } } },
  },
  {
    name: 'master_staff_info_multi',
    description: '複数社員の詳細を一括取得する。全社員のディレクトリ作成に最適。',
    inputSchema: { type: 'object', required: ['user_ids'], properties: { user_ids: { type: 'string', description: 'カンマ区切り' } } },
  },
  {
    name: 'staff_current',
    description: '「自分は誰か」をAPIトークンから返す(whoami)。user_id・氏名・会社・user_type・is_admin(管理者かどうか) を取得する。',
    inputSchema: { type: 'object', properties: {} },
  },

  // ============ 顧客マスタ ============
  ...simpleMasterTools('customer', '顧客', 'customer_id', 'customer_ids'),

  // ============ 支社マスタ ============
  {
    name: 'office_list',
    description: '支社の一覧を取得する。',
    inputSchema: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, q: { type: 'string' } } },
  },
  {
    name: 'office_info',
    description: '指定IDの支社詳細を取得する。',
    inputSchema: { type: 'object', required: ['office_id'], properties: { office_id: { type: 'string' } } },
  },
  {
    name: 'office_info_multi',
    description: '複数支社の詳細を一括取得する。',
    inputSchema: { type: 'object', required: ['office_ids'], properties: { office_ids: { type: 'string' } } },
  },
  {
    name: 'office_new',
    description: '支社を新規作成する。name/kana/postcode/prefecture/city/tel が必須。',
    inputSchema: {
      type: 'object',
      required: ['name', 'kana', 'postcode', 'prefecture', 'city', 'tel'],
      properties: {
        name: { type: 'string' }, kana: { type: 'string' }, postcode: { type: 'string' },
        prefecture: { type: 'string' }, city: { type: 'string' }, town: { type: 'string' },
        tel: { type: 'string' }, fax: { type: 'string' }, foreign_id: { type: 'string' },
      },
    },
  },
  {
    name: 'office_edit',
    description: '支社を編集する。name/kana/postcode/prefecture/city/tel が必須。',
    inputSchema: {
      type: 'object',
      required: ['office_id', 'name', 'kana', 'postcode', 'prefecture', 'city', 'tel'],
      properties: {
        office_id: { type: 'string' }, name: { type: 'string' }, kana: { type: 'string' },
        postcode: { type: 'string' }, prefecture: { type: 'string' }, city: { type: 'string' },
        town: { type: 'string' }, tel: { type: 'string' }, fax: { type: 'string' }, foreign_id: { type: 'string' },
      },
    },
  },
  {
    name: 'office_delete',
    description: '支社を削除する。',
    inputSchema: { type: 'object', required: ['office_id'], properties: { office_id: { type: 'string' } } },
  },

  // ============ 部署マスタ ============
  ...simpleMasterTools('department', '部署', 'department_id', 'department_ids'),

  // ============ 役職マスタ ============
  ...simpleMasterTools('position', '役職', 'position_id', 'position_ids'),

  // ============ 物件区分マスタ ============
  ...simpleMasterTools('construction_type', '物件区分', 'construction_type_id', 'construction_type_ids'),
  {
    name: 'master_construction_types',
    description: '物件区分の一覧（旧称、construction_type_listと同じ）。',
    inputSchema: { type: 'object', properties: {} },
  },

  // ============ 業種区分マスタ ============
  ...simpleMasterTools('industry_type', '業種区分', 'industry_type_id', 'industry_type_ids'),
  {
    name: 'master_industry_types',
    description: '業種区分の一覧（旧称、industry_type_listと同じ）。',
    inputSchema: { type: 'object', properties: {} },
  },

  // ============ 建物タイプマスタ ============
  ...simpleMasterTools('property_type', '建物タイプ', 'property_type_id', 'property_type_ids'),

  // ============ 協力会社マスタ（読み取り専用） ============
  {
    name: 'company_list',
    description: '協力会社の一覧を取得する。',
    inputSchema: { type: 'object', properties: { page: { type: 'string' }, limit: { type: 'string' }, q: { type: 'string' } } },
  },
  {
    name: 'company_info',
    description: '指定IDの協力会社詳細を取得する。',
    inputSchema: { type: 'object', required: ['company_id'], properties: { company_id: { type: 'string' } } },
  },
  {
    name: 'company_info_multi',
    description: '複数協力会社の詳細を一括取得する。',
    inputSchema: { type: 'object', required: ['company_ids'], properties: { company_ids: { type: 'string' } } },
  },
];

async function handleTool(client, name, args) {
  switch (name) {
    case 'work_list':           return work.listWorks(client, args);
    case 'work_info':           return work.getWork(client, args);
    case 'work_info_multi':     return work.getWorksMulti(client, args);
    case 'work_new':            return work.createWork(client, args);
    case 'work_edit':           return work.editWork(client, args);
    case 'work_delete':         return work.deleteWork(client, args);
    case 'gantt_list':          return gantt.listGantts(client, args);
    case 'gantt_info':          return gantt.getGantt(client, args);
    case 'gantt_info_multi':    return gantt.getGanttsMulti(client, args);
    case 'gantt_new':           return gantt.createGantt(client, args);
    case 'gantt_edit':          return gantt.editGantt(client, args);
    case 'gantt_edit_multi':    return gantt.editGanttsMulti(client, args);
    case 'schedule_list':       return schedule.listSchedules(client, args);
    case 'schedule_info':       return schedule.getSchedule(client, args);
    case 'schedule_info_multi': return schedule.getSchedulesMulti(client, args);
    case 'schedule_new':        return schedule.createSchedule(client, args);
    case 'schedule_edit':       return schedule.editSchedule(client, args);
    case 'schedule_delete':     return schedule.deleteSchedule(client, args);
    case 'master_staff':            return master.listStaff(client);
    case 'master_staff_info':       return master.getStaffInfo(client, args);
    case 'master_staff_info_multi': return master.getStaffInfoMulti(client, args);
    case 'staff_current':           return client.currentStaff();
    case 'customer_list':       return customer.list(client, args);
    case 'customer_info':       return customer.info(client, args);
    case 'customer_info_multi': return customer.multi(client, args);
    case 'customer_new':        return customer.create(client, args);
    case 'customer_edit':       return customer.edit(client, args);
    case 'customer_delete':     return customer.remove(client, args);
    case 'office_list':         return office.list(client, args);
    case 'office_info':         return office.info(client, args);
    case 'office_info_multi':   return office.multi(client, args);
    case 'office_new':          return office.create(client, args);
    case 'office_edit':         return office.edit(client, args);
    case 'office_delete':       return office.remove(client, args);
    case 'department_list':         return department.list(client, args);
    case 'department_info':         return department.info(client, args);
    case 'department_info_multi':   return department.multi(client, args);
    case 'department_new':          return department.create(client, args);
    case 'department_edit':         return department.edit(client, args);
    case 'department_delete':       return department.remove(client, args);
    case 'position_list':           return position.list(client, args);
    case 'position_info':           return position.info(client, args);
    case 'position_info_multi':     return position.multi(client, args);
    case 'position_new':            return position.create(client, args);
    case 'position_edit':           return position.edit(client, args);
    case 'position_delete':         return position.remove(client, args);
    case 'construction_type_list':       return master.listConstructionTypes(client);
    case 'construction_type_info':       return master.getConstructionType(client, args);
    case 'construction_type_info_multi': return master.getConstructionTypeMulti(client, args);
    case 'construction_type_new':        return master.createConstructionType(client, args);
    case 'construction_type_edit':       return master.editConstructionType(client, args);
    case 'construction_type_delete':     return master.deleteConstructionType(client, args);
    case 'master_construction_types':    return master.listConstructionTypes(client);
    case 'industry_type_list':       return master.listIndustryTypes(client);
    case 'industry_type_info':       return master.getIndustryType(client, args);
    case 'industry_type_info_multi': return master.getIndustryTypeMulti(client, args);
    case 'industry_type_new':        return master.createIndustryType(client, args);
    case 'industry_type_edit':       return master.editIndustryType(client, args);
    case 'industry_type_delete':     return master.deleteIndustryType(client, args);
    case 'master_industry_types':    return master.listIndustryTypes(client);
    case 'property_type_list':       return propertyType.list(client, args);
    case 'property_type_info':       return propertyType.info(client, args);
    case 'property_type_info_multi': return propertyType.multi(client, args);
    case 'property_type_new':        return propertyType.create(client, args);
    case 'property_type_edit':       return propertyType.edit(client, args);
    case 'property_type_delete':     return propertyType.remove(client, args);
    case 'company_list':       return company.list(client, args);
    case 'company_info':       return company.info(client, args);
    case 'company_info_multi': return company.multi(client, args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

module.exports = { TOOLS, handleTool };
