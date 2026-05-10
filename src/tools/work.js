async function listWorks(client, params = {}) {
  const p = {};
  if (params.name) p.name = params.name;
  if (params.status) p.status = params.status;
  if (params.customer_id) p.customer_id = params.customer_id;
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
