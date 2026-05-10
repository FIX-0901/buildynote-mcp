async function listSchedules(client, params = {}) {
  const p = {};
  if (params.start_date) p.start_date = params.start_date;
  if (params.end_date) p.end_date = params.end_date;
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
