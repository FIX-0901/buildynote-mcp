// BUILDYNOTE の status は文字列値で保存されているため、q[]フィルタ用にIDを文字列名にマッピング
// 1=見込客, 2=受注, 3=完了 (CLAUDE.md準拠)。BUILDYNOTE の生値は "完　了" (中央に全角スペース) なので注意
const STATUS_ID_TO_NAME = {
  '1': '見込客',
  '2': '受注',
  '3': '完　了',
};

async function listWorks(client, params = {}) {
  const p = {};
  if (params.customer_id) p.customer_id = params.customer_id;
  if (params.page) p.page = params.page;

  // BUILDYNOTE API は status/construction_type をトップレベルでは絞り込めないため
  // q[i] 配列形式 (例: q[0]=construction_type=Buildynoteシステム開発#issue) で渡す。
  // name は q[]でも部分一致できないためクライアント側でフィルタする (下記参照)。
  const qFilters = [];

  if (params.status) {
    const statusValue = STATUS_ID_TO_NAME[String(params.status)] || params.status;
    qFilters.push(`status=${statusValue}`);
  }

  if (params.construction_type_id) {
    const ct = await client.call('construction_type_list');
    const found = (ct.list || []).find(c => String(c.id) === String(params.construction_type_id));
    if (found) qFilters.push(`construction_type=${found.name}`);
  }

  qFilters.forEach((q, i) => { p[`q[${i}]`] = q; });

  // 絞り込み時はレスポンスサイズを抑えるため fields を明示
  if (qFilters.length > 0 || params.name) {
    p['fields[0]'] = 'id';
    p['fields[1]'] = 'name';
    p['fields[2]'] = 'construction_type';
    p['fields[3]'] = 'updated';
    p['fields[4]'] = 'status';
  }

  const requestedLimit = parseInt(params.limit, 10) || 50;

  // name はBN API側で部分一致できないので、多めに取得してクライアント側で filter
  if (params.name) {
    p.limit = 1000;
    delete p.page;
  } else if (params.limit) {
    p.limit = params.limit;
  }

  const applyNameFilter = (list) => {
    if (!params.name || !list) return list;
    const q = String(params.name).toLowerCase();
    return list.filter(w => (w.name || '').toLowerCase().includes(q));
  };

  // sort=desc/updated_desc: 全取得 → クライアント側で updated 降順ソート → 指定件数
  if (params.sort === 'desc' || params.sort === 'updated_desc') {
    p.limit = 1000;
    delete p.page;
    const result = await client.call('work_list', p);
    if (result.list) {
      result.list = applyNameFilter(result.list);
      result.list.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
      result.list = result.list.slice(0, requestedLimit);
      result.count = result.list.length;
    }
    return result;
  }

  const result = await client.call('work_list', p);
  if (params.name && result.list) {
    result.list = applyNameFilter(result.list);
    result.list = result.list.slice(0, requestedLimit);
    result.count = result.list.length;
  }
  return result;
}

async function getWork(client, { work_id }) {
  return client.call('work_info', { work_id });
}

async function createWork(client, params) {
  return client.call('work_new', params);
}

async function editWork(client, { work_id, ...rest }) {
  return client.call('work_edit', { work_id, ...rest });
}

async function deleteWork(client, { work_id }) {
  return client.call('work_delete', { work_id });
}

async function getWorksMulti(client, { work_ids } = {}) {
  if (!work_ids) throw new Error('work_ids is required (comma-separated, e.g. "1,3,5")');
  const ids = Array.isArray(work_ids) ? work_ids.join(',') : String(work_ids);
  return client.call('works_info', { work_ids: ids });
}

module.exports = { listWorks, getWork, getWorksMulti, createWork, editWork, deleteWork };
