async function listGantts(client, { work_id }) {
  return client.call('gantt_list', { work_id });
}

async function getGantt(client, { gantt_id }) {
  return client.call('gantt_info', { gantt_id });
}

async function createGantt(client, params) {
  return client.call('gantt_new', params);
}

async function editGantt(client, { gantt_id, ...rest }) {
  return client.call('gantt_edit', { gantt_id, ...rest });
}

module.exports = { listGantts, getGantt, createGantt, editGantt };
