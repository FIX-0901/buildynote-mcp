async function listWorks(client, params = {}) {
  const p = {};
  if (params.customer_id) p.customer_id = params.customer_id;
  if (params.limit) p.limit = params.limit;
  if (params.page) p.page = params.page;

  // BUILDYNOTE API は name/status/construction_type をトップレベルパラメータでは絞り込めないため、
  // q[i] 配列形式に統一して渡す（例: q[0]=name=請求書, q[1]=status=1）
  const qFilters = [];

  if (params.name) qFilters.push(`name=${params.name}`);
  if (params.status) qFilters.push(`status=${params.status}`);

  if (params.construction_type_id) {
    const ct = await client.call('construction_type_list');
    const found = (ct.list || []).find(c => String(c.id) === String(params.construction_type_id));
    if (found) qFilters.push(`construction_type=${found.name}`);
  }

  qFilters.forEach((q, i) => { p[`q[${i}]`] = q; });

  // 絞り込み時は updated/status も返すように fields を明示
  if (qFilters.length > 0) {
    p['fields[0]'] = 'id';
    p['fields[1]'] = 'name';
    p['fields[2]'] = 'construction_type';
    p['fields[3]'] = 'updated';
    p['fields[4]'] = 'status';
  }

  // sort=desc のとき: 全取得してクライアント側で updated 降順ソート後、指定件数だけ返す
  if (params.sort === 'desc' || params.sort === 'updated_desc') {
    const returnLimit = parseInt(params.limit, 10) || 20;
    p.limit = 1000;
    delete p.page;
    const result = await client.call('work_list', p);
    if (result.list) {
      result.list.sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
      result.list = result.list.slice(0, returnLimit);
    }
    return result;
  }

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

module.exports = { listWorks, getWork, createWork, editWork, deleteWork };
