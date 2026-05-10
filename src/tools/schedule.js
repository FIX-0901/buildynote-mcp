async function listSchedules(client, params = {}) {
  const p = {};
  if (params.user_id) p.user_id = params.user_id;
  if (params.schedule_date) p.schedule_date = params.schedule_date;
  if (params.schedule_end_date) p.schedule_end_date = params.schedule_end_date;
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
