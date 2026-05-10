function toIsoDatetime(s) {
  if (!s) return null;
  // YYYY-MM-DD → YYYY-MM-DDT00:00:00 に変換（時刻なしの場合）
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s;
}

function toIsoEndDatetime(s) {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T23:59:59' : s;
}

async function listSchedules(client, params = {}) {
  const p = {};
  if (params.user_id) p.user_id = params.user_id;
  if (params.start_date) p.start_date = toIsoDatetime(params.start_date);
  if (params.end_date) p.end_date = toIsoEndDatetime(params.end_date);
  if (params.work_id) p.work_id = params.work_id;
  return client.call('schedule_list', p);
}

async function getSchedule(client, { schedule_id }) {
  return client.call('schedule_info', { schedule_id });
}

async function createSchedule(client, params) {
  return client.call('schedule_new', params);
}

async function editSchedule(client, { schedule_id, ...rest }) {
  return client.call('schedule_edit', { schedule_id, ...rest });
}

async function deleteSchedule(client, { schedule_id }) {
  return client.call('schedule_delete', { schedule_id });
}

module.exports = { listSchedules, getSchedule, createSchedule, editSchedule, deleteSchedule };
