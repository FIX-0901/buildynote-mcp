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

  // 画面表示用の仕事ID（B+5桁形式、 例: B01762）。 BUILDYNOTE 内部で code フィールドに格納
  if (params.code) qFilters.push(`code=${params.code}`);

  // 外部連携ID（例: gitlab:14:3294）。 GitLab/CRM 等の外部システム参照用
  if (params.foreign_id) qFilters.push(`foreign_id=${params.foreign_id}`);

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

  // 全ページ走査ヘルパ。
  // BUILDYNOTE API は limit 上限が実質 1000 のため、 1ページでは全仕事(約3900件)を取りきれない。
  // name 部分一致や sort=desc はクライアント側で行う関係上、 全ページ集約しないと
  // 1000件目以降に埋もれた仕事を取りこぼす（「0601テスト」が name検索で 0件になる bug の原因）。
  // q[]フィルタ（construction_type/status/code/foreign_id）付きならサーバー側で絞られるので
  // pageCount が小さく軽い。 name 単独時のみ全件（～4ページ）走査する。
  const fetchAllPages = async (maxPages = 10) => {
    const first = await client.call('work_list', { ...p, limit: 1000, page: 1 });
    let all = first.list || [];
    const pageCount = Math.min(first.pageCount || 1, maxPages);
    for (let pg = 2; pg <= pageCount; pg++) {
      const r = await client.call('work_list', { ...p, limit: 1000, page: pg });
      all = all.concat(r.list || []);
    }
    return all;
  };

  const applyNameFilter = (list) => {
    if (!params.name || !list) return list;
    const q = String(params.name).toLowerCase();
    return list.filter(w => (w.name || '').toLowerCase().includes(q));
  };

  // name 検索 または sort=desc/updated_desc は全ページ走査が必要
  if (params.name || params.sort === 'desc' || params.sort === 'updated_desc') {
    delete p.page;
    let list = await fetchAllPages();
    list = applyNameFilter(list);
    if (params.sort === 'desc' || params.sort === 'updated_desc') {
      list.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    }
    list = list.slice(0, requestedLimit);
    return { page: 1, limit: requestedLimit, count: list.length, prevPage: false, nextPage: false, pageCount: 1, list };
  }

  if (params.limit) p.limit = params.limit;
  return client.call('work_list', p);
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
