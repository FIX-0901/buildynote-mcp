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

// YYYY-MM-DD → YYYY-MM-DDT00:00:00（gantt_list は T付き形式が必須）
function toGanttDatetime(s, endOfDay) {
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + (endOfDay ? 'T23:59:59' : 'T00:00:00');
  return s;
}

async function listGantts(client, params = {}) {
  const p = { work_id: params.work_id };
  if (params.start_date) p.start_date = toGanttDatetime(params.start_date, false);
  if (params.end_date) p.end_date = toGanttDatetime(params.end_date, true);
  return client.call('gantt_list', p);
}

// 工程の横断検索: user_id / company_id / work_id / 期間 で絞り込む
// BUILDYNOTE 本体仕様: user_id, work_id, company_id, start_date, end_date のいずれか一つ必須
async function searchGantts(client, params = {}) {
  const p = {};
  if (params.user_id) p.user_id = params.user_id;
  if (params.work_id) p.work_id = params.work_id;
  if (params.company_id) p.company_id = params.company_id;
  if (params.start_date) p.start_date = toGanttDatetime(params.start_date, false);
  if (params.end_date) p.end_date = toGanttDatetime(params.end_date, true);
  if (params.limit) p.limit = params.limit;
  if (params.page) p.page = params.page;
  if (params.fields) p.fields = params.fields;
  if (Object.keys(p).length === 0) {
    throw new Error('user_id / work_id / company_id / start_date / end_date のいずれか一つ必須');
  }
  return client.call('gantt_list', p);
}

async function getGantt(client, { gantt_id }) {
  // API仕様書: パラメータ名は schedule_id（gantt_id ではない）
  return client.call('gantt_info', { schedule_id: gantt_id });
}

async function createGantt(client, params) {
  return client.call('gantt_new', params);
}

async function editGantt(client, { gantt_id, work_id, status, ...rest }) {
  // gantt_edit は work_id + schedule_id + status + category が必須。
  // category が省略された場合は gantt_info から取得して補完する（read-modify-write）。
  let resolvedCategory = rest.category;
  if (!resolvedCategory) {
    const info = await client.call('gantt_info', { schedule_id: gantt_id });
    if (info.errors) return info;
    // gantt_info はカテゴリ名を返すので数値に変換
    resolvedCategory = CATEGORY_MAP[info.category] || info.category;
    // 他の省略フィールドも補完（名前・日付は指定がなければ既存値を使う）
    if (!rest.name) rest.name = info.name;
    if (!rest.day_start) rest.day_start = (info.start_date || '').substring(0, 10);
    if (!rest.day_end) rest.day_end = (info.end_date || '').substring(0, 10);
  }
  return client.call('gantt_edit', {
    schedule_id: gantt_id,
    work_id,
    status: status || '1',
    category: resolvedCategory,
    ...rest,
  });
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

module.exports = { listGantts, searchGantts, getGantt, getGanttsMulti, createGantt, editGantt, editGanttsMulti, copyGantts };
