const CATEGORY_MAP = { '社内': '1', '工事': '2', '納材': '3', '検査': '4' };

// YYYY-MM-DD に N日加算（UTC基準でタイムゾーンずれを回避）
function addDays(ymd, days) {
  if (!ymd) return ymd;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (parseInt(days, 10) || 0));
  return dt.toISOString().substring(0, 10);
}

// 2つの YYYY-MM-DD の日数差（to - from）
function dayDiff(fromYmd, toYmd) {
  const f = Date.parse(fromYmd + 'T00:00:00Z');
  const t = Date.parse(toYmd + 'T00:00:00Z');
  return Math.round((t - f) / 86400000);
}

// gantt_new 用に payload を PHP配列形式へ展開（supplier_user[i][user_id] 等）
function flattenGanttNew(payload) {
  const out = {};
  for (const [key, val] of Object.entries(payload)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      val.forEach((sub, i) => {
        if (sub && typeof sub === 'object') {
          for (const [k2, v2] of Object.entries(sub)) {
            if (v2 !== undefined && v2 !== null) out[`${key}[${i}][${k2}]`] = v2;
          }
        } else if (sub !== undefined && sub !== null) {
          out[`${key}[${i}]`] = sub;
        }
      });
    } else {
      out[key] = val;
    }
  }
  return out;
}

// --- 受注/発注担当者(supplier_user/order_user)の正規化と会社ID解決 ---
// BUILDYNOTE本体仕様(RestApiController):
//  (1) supplier_user の保存は supplier_company_id がある時だけ処理される（無いとエラーも出さず黙って捨てる）
//  (2) 受信した supplier_user は is_array() でなければ空扱い（PHP配列展開 flattenGanttNew が必須）
//  (3) 受注担当者に is_chief=1 が1人もいないと G003-004-017「受注会社の責任者が設定されていません」エラー
// このため write 系では「正規化 → 責任者保証 → 会社ID解決 → 展開」を必ず通す。
//
// ⚠️【工程の役割ユーザーは全て同じサイレントドロップの罠を持つ】(ISSUE #3289 note_54205 の教訓)
// BUILDYNOTE の工程(Schedule)には ScheduleUser で 5 種の役割ユーザーが紐づく:
//   schedule_user_type: 1=受注(supplier) / 2=関係(other) / 3=実施(constructor) / 4=発注(order) / 5=承認(approval)
// RestApiController の create_gantt / edit_gantt は、これらを次の形式で受け取る:
//   ● is_array 配列で送らないと is_array()=false で【エラーも出さず空扱いで黙って破棄】されるフィールド（＝flatten必須・生渡し厳禁）:
//       supplier_user   (create 15999 / edit 16846付近)
//       constructor_user(create 16114 / edit 17564)  ← 実施会社担当者
//       other_company   (create 16171 / edit 17652)  ← 関係会社（会社ではなくユーザー配列を渡す）
//       approval_user   (create 16267 / edit 17788)  ← 検査承認者
//     → client.call の querystring.stringify は key[i][k] 形式を作れないため、payload に載せる前に
//       必ず flattenGanttNew を通すこと。editGantt/createGantt は末尾で payload 全体を flatten するので
//       ...rest に載せれば自動展開される（＝flatten自体は既に安全。危険なのは下記の意味論ゲート）。
//   ● スカラーで良いもの: constructor_company_id (create 16080 / edit 17527)
// 意味論ゲート（知らないと嵌まる。flatten しても以下を満たさないと保存されない）:
//   [実施会社=constructor] 3つ全て必須:
//     (a) is_constructor=1 を併送（無いと constructor 系を丸ごと無視。別種のサイレントドロップ）
//     (b) constructor_company_id 必須（無いと G003-005-019「実施会社が存在しません」）
//     (c) constructor_user に is_chief=1 が1人必須（無いと G003-005-021「実施会社の責任者が設定されていません」）
//   [関係会社=other_company] 会社IDパラメータ無し・is_chief不要。ユーザー配列だけ渡せば所属会社をDB逆引きする。
// 現状 server.js が露出しているのは supplier_user / order_user のみ。constructor/other/approval を
// 設定機能化する場合は、下記の supplier 用ヘルパ(normalizeUsers/ensureChief/resolveSupplierCompany)と
// 同型の前処理(prepareConstructorUsers/prepareOtherCompany)を必ず結線し、editGantt では既存値保全も足すこと。
function isChiefValue(v) { return (v === true || v === 1 || v === '1') ? 1 : 0; }
function hasUsers(arr) { return Array.isArray(arr) && arr.length > 0; }

// [{user_id, is_chief}] を {user_id:文字列, is_chief:0/1} の配列へ正規化（is_chief は '0' を誤って真にしない）
function normalizeUsers(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr
    .filter(u => u && u.user_id !== undefined && u.user_id !== null)
    .map(u => ({ user_id: String(u.user_id), is_chief: isChiefValue(u.is_chief) }));
}

// 受注担当者に責任者が1人もいなければ先頭を責任者にする（G003-004-017回避）
function ensureChief(arr) {
  if (Array.isArray(arr) && arr.length > 0 && !arr.some(u => u.is_chief === 1)) arr[0].is_chief = 1;
  return arr;
}

// 自社社員IDの集合を全ページ走査で取得（user_list は50件ページングのため）
async function fetchInternalUserIds(client) {
  const ids = new Set();
  for (let page = 1; page <= 40; page++) {
    const res = await client.call('user_list', { page, limit: 100 });
    if (res && res.errors) break;
    const list = (res && (res.list || res.data)) || (Array.isArray(res) ? res : []);
    for (const s of list) {
      const id = s && (s.id != null ? s.id : s.user_id);
      if (id != null) ids.add(String(id));
    }
    if (!res || !res.nextPage || list.length === 0) break;
  }
  return ids;
}

// supplier_company_id を解決する。優先順位:
//  ①明示値 → ②gantt_info の既存値 → ③受注担当者が全員自社社員なら自社会社ID → ④不可なら明確なエラー
// （サイレントドロップを防ぐため、解決できなければ throw する）
async function resolveSupplierCompany(client, { supplier_company_id, supplier_user, info }) {
  if (supplier_company_id) return String(supplier_company_id);
  if (info && info.supplier_company_id) return String(info.supplier_company_id);
  const me = await client.call('staff_current');
  const myCompany = me && me.company_id != null ? String(me.company_id) : null;
  const internalIds = await fetchInternalUserIds(client);
  const allInternal = hasUsers(supplier_user) && supplier_user.every(u => internalIds.has(String(u.user_id)));
  if (allInternal && myCompany) return myCompany;
  throw new Error(
    'supplier_user を指定する場合は supplier_company_id が必須です。' +
    '受注担当者に自社以外（協力会社）の人が含まれるため会社IDを自動補完できませんでした。' +
    '自社担当なら staff_current の company_id、協力会社なら company_list で受注会社IDを調べて supplier_company_id を指定してください。'
  );
}

// --- 実施会社(constructor)・関係会社(other_company) の write 前処理ヘルパ ---
// ISSUE #3289 note_54205 と同型のサイレントドロップ予防。現状は server.js が露出していないため
// 未結線だが、constructor/other を設定機能化する際は createGantt/editGantt の前処理でこれを呼ぶこと。
// （露出前でも「土台」として置き、罠を1箇所に閉じ込める狙い。）

// 会社IDを解決する汎用版。resolveSupplierCompany と同ロジックだが info のキーを差し替えられる。
// 優先順位: ①明示値 → ②既存info[infoKey] → ③担当者が全員自社社員なら自社会社ID → ④不可なら明確なエラー。
async function resolveRoleCompany(client, { company_id, users, info, infoKey, roleLabel }) {
  if (company_id) return String(company_id);
  if (info && info[infoKey]) return String(info[infoKey]);
  const me = await client.call('staff_current');
  const myCompany = me && me.company_id != null ? String(me.company_id) : null;
  const internalIds = await fetchInternalUserIds(client);
  const allInternal = hasUsers(users) && users.every(u => internalIds.has(String(u.user_id)));
  if (allInternal && myCompany) return myCompany;
  throw new Error(
    `${roleLabel}の担当者を指定する場合は会社IDが必須です。` +
    `担当者に自社以外（協力会社）の人が含まれるため会社IDを自動補完できませんでした。` +
    `自社担当なら staff_current の company_id、協力会社なら company_list で会社IDを調べて指定してください。`
  );
}

// 実施会社(constructor)の3ゲートを満たす payload 断片を作る。
//  (a) is_constructor=1 併送 (b) constructor_company_id 必須 (c) is_chief=1 を1人保証。
// 生の constructor_user は必ず normalizeUsers → ensureChief を通し、最終 flatten で PHP配列形式へ展開される。
async function prepareConstructorUsers(client, { constructor_user, constructor_company_id, info }) {
  if (!hasUsers(constructor_user)) return {};
  const users = ensureChief(normalizeUsers(constructor_user));
  const companyId = await resolveRoleCompany(client, {
    company_id: constructor_company_id, users, info,
    infoKey: 'constructor_company_id', roleLabel: '実施会社',
  });
  // is_constructor=1 を併送しないと BUILDYNOTE本体は constructor 系を丸ごと無視する（別種のサイレントドロップ）。
  return { is_constructor: '1', constructor_company_id: companyId, constructor_user: users };
}

// 関係会社(other_company)の payload 断片を作る。会社ID不要・is_chief不要。ユーザー配列だけ正規化して返す。
// （BUILDYNOTE本体が各ユーザーの所属会社をDB逆引きする。is_array ゲートは同じなので最終 flatten は必須。）
function prepareOtherCompany({ other_company }) {
  if (!hasUsers(other_company)) return {};
  const users = other_company
    .filter(u => u && u.user_id !== undefined && u.user_id !== null)
    .map(u => ({ user_id: String(u.user_id) }));
  return { other_company: users };
}

// YYYY-MM-DD → YYYY-MM-DDT00:00:00（gantt_list は T付き形式が必須）
function toGanttDatetime(s, endOfDay) {
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + (endOfDay ? 'T23:59:59' : 'T00:00:00');
  return s;
}

// --- gantt_list の2大トラップ対策（overlap + 全ページ走査） ---
// BUILDYNOTE の gantt_list は以下2つの罠がある:
//  (1) 日付フィルタが「開始日・終了日の両方が指定期間内に収まる工程」だけを返す
//      → 期間をまたぐ長期工程（例 5/1〜6/29 を 6月窓で問い合わせ）が黙って欠落する。
//  (2) 1ページ既定50件で打ち切り（ページ送りしないと後半が消える）。さらに
//      日付を一切指定しないと0件になる仕様のため、必ず期間を渡す必要がある。
// 対策: 取得時は期間を極端に広げて (1) を無効化し、全ページ走査で (2) を解消、
//      最後に手元で「真の重なり」に絞って返す。これで「明日active な工程」が正しく出る。
const WIDE_START = '2000-01-01T00:00:00';
const WIDE_END = '2100-12-31T23:59:59';
const PAGE_LIMIT = 500;
const MAX_PAGES = 40; // 安全弁（最大 20000 件）

const ymd = s => (s || '').slice(0, 10);

// gantt_list を全ページ走査して list を結合する（50件キャップ対策）
async function fetchAllGanttPages(client, baseParams) {
  let all = [];
  let last = {};
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.call('gantt_list', { ...baseParams, limit: PAGE_LIMIT, page });
    last = res;
    if (res && res.errors) return res; // エラーはそのまま返す
    const l = (res && res.list) || [];
    all = all.concat(l);
    if (l.length < PAGE_LIMIT) break;
  }
  return { ...last, list: all };
}

// 指定期間に「重なる」工程を返す共通処理（取得は常に広期間＋全ページ、最後に重なりで絞る）
async function ganttOverlapSearch(client, baseParams, startDate, endDate) {
  const wantStart = startDate ? ymd(startDate) : null;
  const wantEnd = endDate ? ymd(endDate) : null;

  // 取得は常に広期間で（日付未指定だと0件になる仕様のため、必ず期間を渡す）
  const fetchParams = { ...baseParams, start_date: WIDE_START, end_date: WIDE_END };
  // overlap 判定に開始日・終了日が必須なので fields 指定時は補完する
  if (fetchParams.fields) {
    if (!/start_date/.test(fetchParams.fields)) fetchParams.fields += ',start_date';
    if (!/end_date/.test(fetchParams.fields)) fetchParams.fields += ',end_date';
  }

  const res = await fetchAllGanttPages(client, fetchParams);
  if (res && res.errors) return res;

  let list = res.list || [];
  if (wantStart || wantEnd) {
    list = list.filter(g => {
      const gs = ymd(g.start_date);
      const ge = ymd(g.end_date);
      if (wantEnd && gs && gs > wantEnd) return false;     // 指定終了より後に始まる工程は対象外
      if (wantStart && ge && ge < wantStart) return false; // 指定開始より前に終わる工程は対象外
      return true;
    });
  }
  return { ...res, list, total: list.length };
}

// --- 役割別の仕分け（search_gantts で user_id 指定時） ---
// 工程には対象ユーザーが「発注/受注/実施/関係」のどの立場で関わるかが gantt_info に入っている。
// gantt_list 自体は役割を返さないため、候補idを gantts_info(複数一括) で引いて役割を判定する。
// BUILDYNOTE のカレンダーは 受注/実施/関係 のみ表示し、発注のみの工程は出ない（その旨を on_calendar で示す）。
const ROLE_DEFS = [
  { key: 'order', field: 'order_user', label: '発注している工程', on_calendar: false },
  { key: 'supplier', field: 'supplier_user', label: '受注している工程', on_calendar: true },
  { key: 'constructor', field: 'constructor_user', label: '実施者となっている工程', on_calendar: true },
  { key: 'other', field: 'other_user', label: '関係している工程', on_calendar: true },
];

const inRole = (arr, uid) => Array.isArray(arr) && arr.some(u => String(u.user_id) === String(uid));

// gantts_info を50件ずつ一括取得して id→詳細 の Map にする
async function fetchGanttInfoMap(client, ids) {
  const map = new Map();
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK).map(String);
    const r = await client.call('gantts_info', { schedule_ids: slice.join(',') });
    const arr = (r && (r.list || r.data)) || (Array.isArray(r) ? r : []);
    for (const g of arr) if (g && g.id != null) map.set(String(g.id), g);
  }
  return map;
}

// overlap で得た工程に、対象ユーザーの役割を付与し役割別バケットに仕分ける
async function enrichWithUserRoles(client, overlapRes, uid) {
  const src = overlapRes.list || [];
  const by_role = { order: [], supplier: [], constructor: [], other: [] };
  if (src.length === 0) {
    return { ...overlapRes, by_role, role_labels: roleLabels(), note: roleNote() };
  }
  const infoMap = await fetchGanttInfoMap(client, src.map(g => g.id));
  const enriched = [];
  for (const g of src) {
    const info = infoMap.get(String(g.id)) || {};
    const your_roles = ROLE_DEFS.filter(d => inRole(info[d.field], uid)).map(d => d.key);
    const item = {
      id: g.id, name: g.name, work_id: g.work_id, work_name: g.work_name,
      start_date: g.start_date, end_date: g.end_date,
      your_roles,
      on_calendar: your_roles.some(k => ROLE_DEFS.find(d => d.key === k).on_calendar),
    };
    enriched.push(item);
    for (const k of your_roles) by_role[k].push(item);
  }
  return { ...overlapRes, list: enriched, total: enriched.length, by_role, role_labels: roleLabels(), note: roleNote() };
}

const roleLabels = () => ROLE_DEFS.reduce((o, d) => (o[d.key] = d.label, o), {});
const roleNote = () =>
  '工程は対象ユーザーの立場(発注/受注/実施/関係)で by_role に仕分けてあります。' +
  '発注のみの工程は本人のカレンダーに表示されません(on_calendar=false)。関係している工程(other)は関係会社としての参加です。';

async function listGantts(client, params = {}) {
  // 明示的に page 指定がある場合は従来の単発呼び出し（エスケープハッチ）
  if (params.page) {
    const p = { work_id: params.work_id };
    if (params.start_date) p.start_date = toGanttDatetime(params.start_date, false);
    if (params.end_date) p.end_date = toGanttDatetime(params.end_date, true);
    if (params.limit) p.limit = params.limit;
    p.page = params.page;
    return client.call('gantt_list', p);
  }
  const base = { work_id: params.work_id };
  if (params.fields) base.fields = params.fields;
  return ganttOverlapSearch(client, base, params.start_date, params.end_date);
}

// 工程の横断検索: user_id / company_id / work_id / 期間 で絞り込む
// BUILDYNOTE 本体仕様: user_id, work_id, company_id, start_date, end_date のいずれか一つ必須
async function searchGantts(client, params = {}) {
  const base = {};
  if (params.user_id) base.user_id = params.user_id;
  if (params.work_id) base.work_id = params.work_id;
  if (params.company_id) base.company_id = params.company_id;
  if (params.fields) base.fields = params.fields;
  if (Object.keys(base).length === 0 && !params.start_date && !params.end_date) {
    throw new Error('user_id / work_id / company_id / start_date / end_date のいずれか一つ必須');
  }
  // 明示的に page 指定がある場合は従来の単発呼び出し（エスケープハッチ）
  if (params.page) {
    const p = { ...base };
    if (params.start_date) p.start_date = toGanttDatetime(params.start_date, false);
    if (params.end_date) p.end_date = toGanttDatetime(params.end_date, true);
    if (params.limit) p.limit = params.limit;
    p.page = params.page;
    return client.call('gantt_list', p);
  }
  const res = await ganttOverlapSearch(client, base, params.start_date, params.end_date);
  // user_id 指定時は役割別に仕分けて返す（発注/受注/実施/関係）
  if (params.user_id && res && !res.errors) {
    return enrichWithUserRoles(client, res, params.user_id);
  }
  return res;
}

async function getGantt(client, { gantt_id }) {
  // API仕様書: パラメータ名は schedule_id（gantt_id ではない）
  return client.call('gantt_info', { schedule_id: gantt_id });
}

// REST 層の start_date/end_date 入力を gantt_new 用 payload(day_start/day_end・PHP配列展開) に変換する。
// 変換漏れだと「開始日が設定されていません」(G003-004-008)エラーになる。
function buildGanttNewPayload(params) {
  const { start_date, end_date, day_start, day_end, category, ...rest } = params;
  const payload = { ...rest };
  const ds = day_start || start_date;
  const de = day_end || end_date;
  if (ds) payload.day_start = String(ds).substring(0, 10);
  if (de) payload.day_end = String(de).substring(0, 10);
  // category は数値(1-4)。和名（社内/工事/納材/検査）で来た場合に備えてマップ
  if (category !== undefined && category !== null) {
    payload.category = CATEGORY_MAP[category] || category;
  }
  return flattenGanttNew(payload);
}

// gantt_new に supplier_user/order_user/constructor_user/other_company がある場合の共通前処理:
// 正規化 → 会社ID解決(新規なので既存info無し) → 責任者保証。失敗時は throw（呼び出し側で握る）。
// constructor/other も supplier と同じ is_array サイレントドロップの罠を持つため、ここで必ず正規化する。
async function prepareNewGanttSupplier(client, params) {
  const p = { ...params };
  if (hasUsers(p.supplier_user)) {
    p.supplier_user = normalizeUsers(p.supplier_user);
    p.supplier_company_id = await resolveSupplierCompany(client, {
      supplier_company_id: p.supplier_company_id, supplier_user: p.supplier_user, info: null,
    });
    ensureChief(p.supplier_user);
  }
  if (hasUsers(p.order_user)) p.order_user = normalizeUsers(p.order_user);
  // 実施会社(constructor): is_constructor=1 併送・会社ID解決・責任者保証をまとめて付与
  if (hasUsers(p.constructor_user)) {
    Object.assign(p, await prepareConstructorUsers(client, {
      constructor_user: p.constructor_user, constructor_company_id: p.constructor_company_id, info: null,
    }));
  }
  // 関係会社(other_company): 会社ID/責任者不要。ユーザー配列を正規化するだけ
  if (hasUsers(p.other_company)) Object.assign(p, prepareOtherCompany({ other_company: p.other_company }));
  return p;
}

async function createGantt(client, params) {
  const prepared = await prepareNewGanttSupplier(client, params);
  return client.call('gantt_new', buildGanttNewPayload(prepared));
}

// 複数工程を一括登録する。工程表など多数の工程をまとめて作る用。
// 1回の呼び出しで全件 gantt_new し、created/failed を返す（削除APIが無いので失敗は失敗のまま報告）。
async function createGanttsMulti(client, { work_id, gantts } = {}) {
  if (!work_id) throw new Error('work_id is required');
  if (!Array.isArray(gantts) || gantts.length === 0) {
    throw new Error('gantts (array of gantt objects) is required');
  }
  const created = [];
  const failed = [];
  for (let i = 0; i < gantts.length; i++) {
    const g = gantts[i];
    try {
      const prepared = await prepareNewGanttSupplier(client, { work_id, ...g });
      const res = await client.call('gantt_new', buildGanttNewPayload(prepared));
      if (res && (res.errors || res.result === false)) {
        failed.push({ index: i, name: g.name, error: res.errors || 'unknown' });
      } else {
        created.push({ index: i, name: g.name, schedule_id: res.id || res.schedule_id || null });
      }
    } catch (e) {
      failed.push({ index: i, name: g.name, error: e.message });
    }
  }
  return {
    work_id,
    total: gantts.length,
    created_count: created.length,
    failed_count: failed.length,
    created,
    failed,
  };
}

async function editGantt(client, { gantt_id, work_id, status, ...rest }) {
  // gantt_edit は work_id + schedule_id + status + category が必須。
  // 担当者(supplier_user/order_user)を正規化（責任者保証は会社ID解決後）。
  if (hasUsers(rest.supplier_user)) rest.supplier_user = normalizeUsers(rest.supplier_user);
  if (hasUsers(rest.order_user)) rest.order_user = normalizeUsers(rest.order_user);

  // gantt_info を引く条件: category/名前/日付の補完、または受注会社IDの解決・既存担当者の保全が要るとき。
  // read-modify-write: gantt_edit は受け取った値で上書きするため、明示されない supplier 系は
  // 既存値を再送しないと消える。そのため supplier_user 未指定でも既存 info を引いて保全する。
  // ⚠️ constructor(実施会社)/other(関係会社) を設定機能化する際は、ここに supplier と同じ既存値保全を
  //    追加すること（prepareConstructorUsers/prepareOtherCompany を結線し、未変更時は info から再送）。
  //    現状はこれらを送らないため BUILDYNOTE本体の既存値フォールバック($usr3/$usr2)で温存されている。
  const needInfo = !rest.category
    || !rest.name || !rest.day_start || !rest.day_end
    || (hasUsers(rest.supplier_user) && !rest.supplier_company_id)
    || !hasUsers(rest.supplier_user);
  let info = null;
  if (needInfo) {
    info = await client.call('gantt_info', { schedule_id: gantt_id });
    if (info.errors) return info;
  }

  const resolvedCategory = rest.category
    ? (CATEGORY_MAP[rest.category] || rest.category)
    : (info ? (CATEGORY_MAP[info.category] || info.category) : undefined);
  if (info) {
    if (!rest.name) rest.name = info.name;
    if (!rest.day_start) rest.day_start = (info.start_date || '').substring(0, 10);
    if (!rest.day_end) rest.day_end = (info.end_date || '').substring(0, 10);
  }

  if (hasUsers(rest.supplier_user)) {
    // 受注担当者を変更する: 会社IDを解決（①明示②既存③自社）し、責任者を保証する。
    rest.supplier_company_id = await resolveSupplierCompany(client, {
      supplier_company_id: rest.supplier_company_id, supplier_user: rest.supplier_user, info,
    });
    ensureChief(rest.supplier_user);
  } else if (info && info.supplier_company_id) {
    // 受注担当者は変更しない: 既存の受注会社・担当者を再送して消えないようにする。
    if (!rest.supplier_company_id) rest.supplier_company_id = String(info.supplier_company_id);
    if (!hasUsers(rest.supplier_user) && hasUsers(info.supplier_user)) {
      rest.supplier_user = ensureChief(normalizeUsers(info.supplier_user));
    }
  }

  // 実施会社(constructor)/関係会社(other_company) は「明示された時だけ上書き」。
  // 未指定なら payload に載せず、BUILDYNOTE本体の既存値フォールバック($usr3/$usr2)で温存する
  //（partial に送ると is_constructor/会社IDの分岐で既存が消えうるため、正規化して全部揃えて送る時のみ触る）。
  if (hasUsers(rest.constructor_user)) {
    Object.assign(rest, await prepareConstructorUsers(client, {
      constructor_user: rest.constructor_user, constructor_company_id: rest.constructor_company_id, info,
    }));
  }
  if (hasUsers(rest.other_company)) Object.assign(rest, prepareOtherCompany({ other_company: rest.other_company }));

  const payload = {
    schedule_id: gantt_id,
    work_id,
    status: status || '1',
    category: resolvedCategory,
    ...rest,
  };
  // flattenGanttNew で supplier_user 等を PHP配列形式に展開（未展開だと is_array() false で黙って捨てられる）
  return client.call('gantt_edit', flattenGanttNew(payload));
}

async function getGanttsMulti(client, { schedule_ids } = {}) {
  if (!schedule_ids) throw new Error('schedule_ids is required (comma-separated)');
  const ids = Array.isArray(schedule_ids) ? schedule_ids.join(',') : String(schedule_ids);
  return client.call('gantts_info', { schedule_ids: ids });
}

// gantts[]の配列を PHP配列形式に展開: gantts[i][key]=value、ネストも対応
function flattenGantts(gantts) {
  const out = {};
  if (!Array.isArray(gantts)) return out;
  gantts.forEach((g, i) => {
    for (const [key, val] of Object.entries(g || {})) {
      if (val === undefined || val === null) continue;
      if (Array.isArray(val) && val.every(v => typeof v === 'object')) {
        // 例: supplier_user: [{user_id, is_chief}, ...]
        val.forEach((sub, j) => {
          for (const [k2, v2] of Object.entries(sub || {})) {
            if (v2 !== undefined && v2 !== null) out[`gantts[${i}][${key}][${j}][${k2}]`] = v2;
          }
        });
      } else if (Array.isArray(val)) {
        val.forEach((v, j) => { out[`gantts[${i}][${key}][${j}]`] = v; });
      } else {
        out[`gantts[${i}][${key}]`] = val;
      }
    }
  });
  return out;
}

async function editGanttsMulti(client, { work_id, status, gantts } = {}) {
  if (!work_id) throw new Error('work_id is required');
  if (!status) throw new Error('status is required');
  if (!Array.isArray(gantts) || gantts.length === 0) {
    throw new Error('gantts (array of {schedule_id, ...}) is required');
  }
  // 受注会社IDの解決に既存値が要る item は gantt_info を一括取得（fetchGanttInfoMap）
  const needIds = gantts
    .filter(g => hasUsers(g.supplier_user) && !g.supplier_company_id && g.schedule_id)
    .map(g => String(g.schedule_id));
  const infoMap = needIds.length ? await fetchGanttInfoMap(client, needIds) : new Map();

  for (const g of gantts) {
    if (hasUsers(g.supplier_user)) {
      g.supplier_user = normalizeUsers(g.supplier_user);
      g.supplier_company_id = await resolveSupplierCompany(client, {
        supplier_company_id: g.supplier_company_id,
        supplier_user: g.supplier_user,
        info: infoMap.get(String(g.schedule_id)),
      });
      ensureChief(g.supplier_user);
    }
    if (hasUsers(g.order_user)) g.order_user = normalizeUsers(g.order_user);
  }
  return client.call('gantts_edit', { work_id, status, ...flattenGantts(gantts) });
}

// 工程の一括コピー。 source_work_id の全（または指定）工程を target_work_id に複製する。
// 工程の削除APIが無いため、 dry_run=true（既定）でプレビューを返し、 false で実際に作成する。
// date_mode: 'as_is'（そのまま）/ 'shift'（全工程 +shift_days）/ 'anchor'（最小開始日を anchor_date に合わせ相対関係維持）
async function copyGantts(client, params = {}) {
  const {
    source_work_id,
    target_work_id,
    dry_run = true,
    date_mode = 'as_is',
    shift_days = 0,
    anchor_date,
    gantt_ids,
  } = params;

  if (!source_work_id) throw new Error('source_work_id is required');
  if (!target_work_id) throw new Error('target_work_id is required');

  // 1. ソース工程を広期間で全取得（date range 必須・未指定だと0件になる仕様のため）
  const listRes = await client.call('gantt_list', {
    work_id: source_work_id,
    start_date: '2020-01-01T00:00:00',
    end_date: '2030-12-31T23:59:59',
  });
  let sourceList = listRes.list || [];

  if (gantt_ids) {
    const idset = new Set(String(gantt_ids).split(',').map(s => s.trim()));
    sourceList = sourceList.filter(g => idset.has(String(g.id)));
  }
  if (sourceList.length === 0) {
    return { source_work_id, target_work_id, count: 0, planned: [], message: 'コピー対象の工程が見つかりません（広期間で0件）' };
  }

  // 2. 各工程の詳細を gantt_info で取得（担当者・会社・ラベル等のフルフィールド）
  const details = [];
  for (const g of sourceList) {
    const info = await client.call('gantt_info', { schedule_id: g.id });
    if (info && !info.errors) details.push(info);
  }

  // 3. 日付オフセット計算
  const parseDay = (s) => (s || '').substring(0, 10);
  let offsetDays = 0;
  if (date_mode === 'shift') {
    offsetDays = parseInt(shift_days, 10) || 0;
  } else if (date_mode === 'anchor' && anchor_date) {
    const minStart = details.map(d => parseDay(d.start_date)).filter(Boolean).sort()[0];
    if (minStart) offsetDays = dayDiff(minStart, anchor_date);
  }

  // 4. gantt_info → gantt_new 形式へマッピング
  const planned = details.map(d => {
    const payload = {
      work_id: target_work_id,
      name: d.name,
      category: CATEGORY_MAP[d.category] || d.category,
      status: '1', // 1=開始前（新規なので進捗リセット）
      day_start: addDays(parseDay(d.start_date), offsetDays),
      day_end: addDays(parseDay(d.end_date), offsetDays),
    };
    // supplier_company_id を同時指定しないと supplier_user は反映されない
    if (d.supplier_company_id) payload.supplier_company_id = d.supplier_company_id;
    if (d.order_company_id) payload.order_company_id = d.order_company_id;
    if (d.label_id) payload.label_id = d.label_id;
    if (d.industry_type_id) payload.industry_type_id = d.industry_type_id;
    if (Array.isArray(d.supplier_user) && d.supplier_user.length) {
      payload.supplier_user = d.supplier_user.map(u => ({ user_id: u.user_id, is_chief: u.is_chief ? 1 : 0 }));
    }
    if (Array.isArray(d.order_user) && d.order_user.length) {
      payload.order_user = d.order_user.map(u => ({ user_id: u.user_id, is_chief: u.is_chief ? 1 : 0 }));
    }
    return payload;
  });

  // 5. dry_run: 作成予定の要約を返す（実際には作らない）
  if (dry_run) {
    return {
      dry_run: true,
      source_work_id,
      target_work_id,
      date_mode,
      offset_days: offsetDays,
      count: planned.length,
      planned: planned.map(p => ({
        name: p.name,
        category: p.category,
        day_start: p.day_start,
        day_end: p.day_end,
        supplier_company_id: p.supplier_company_id || null,
        chief_user_ids: (p.supplier_user || []).filter(u => u.is_chief).map(u => u.user_id),
      })),
    };
  }

  // 6. 実行: 各工程を gantt_new で作成（削除APIが無いので慎重に）
  const created = [];
  const failed = [];
  for (const payload of planned) {
    const res = await client.call('gantt_new', flattenGanttNew(payload));
    if (res && (res.errors || res.result === false)) {
      failed.push({ name: payload.name, error: res.errors || 'unknown' });
    } else {
      created.push({ name: payload.name, schedule_id: res.id || res.schedule_id || null, day_start: payload.day_start, day_end: payload.day_end });
    }
  }
  return {
    dry_run: false,
    source_work_id,
    target_work_id,
    date_mode,
    offset_days: offsetDays,
    created_count: created.length,
    failed_count: failed.length,
    created,
    failed,
  };
}

module.exports = { listGantts, searchGantts, getGantt, getGanttsMulti, createGantt, createGanttsMulti, editGantt, editGanttsMulti, copyGantts,
  // テスト/再利用用に内部ヘルパも公開
  normalizeUsers, ensureChief, hasUsers, resolveSupplierCompany, fetchInternalUserIds,
  // 実施会社/関係会社の設定機能化に向けた前処理ヘルパ（結線待ちの土台。#3289 note_54205 予防）
  resolveRoleCompany, prepareConstructorUsers, prepareOtherCompany };
