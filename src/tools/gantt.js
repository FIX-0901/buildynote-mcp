const CATEGORY_MAP = { '社内': '1', '工事': '2', '納材': '3', '検査': '4' };

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

module.exports = { listGantts, getGantt, getGanttsMulti, createGantt, editGantt, editGanttsMulti };
