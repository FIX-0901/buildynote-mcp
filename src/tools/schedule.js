// YYYY-MM-DD → YYYY-MM-DDT00:00:00（schedule_list の start_date 用）
function toIsoDatetime(s) {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T00:00:00' : s;
}

// YYYY-MM-DD → YYYY-MM-DDT23:59:59（schedule_list の end_date 用）
function toIsoEndDatetime(s) {
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s + 'T23:59:59' : s;
}

// user_list: [{user_id: 277}, ...] → {'user_list[0][user_id]': 277, ...}
function flattenUserList(users) {
  if (!users || !Array.isArray(users)) return {};
  const result = {};
  users.forEach((u, i) => {
    const uid = typeof u === 'object' ? u.user_id : u;
    result[`user_list[${i}][user_id]`] = uid;
  });
  return result;
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
  const { user_list, ...rest } = params;
  const users = Array.isArray(user_list) ? [...user_list] : [];
  // APIユーザー(8497)が含まれていなければ自動追加（後から削除できるようにするため）
  if (!users.some(u => String(u.user_id || u) === '8497')) {
    users.push({ user_id: '8497' });
  }
  return client.call('schedule_new', { ...rest, ...flattenUserList(users) });
}

async function editSchedule(client, { schedule_id, user_list, ...rest }) {
  if (rest.is_regular === undefined) rest.is_regular = 0;
  return client.call('schedule_edit', { schedule_id, ...rest, ...flattenUserList(user_list) });
}

async function deleteSchedule(client, { schedule_id }) {
  // schedule_delete はAPIユーザー(8497)が user_list にいる場合のみ成功する。
  // 8497 が含まれていない既存予定は、先に schedule_edit で追加してから削除する。
  const info = await client.call('schedule_info', { schedule_id });
  if (info.errors) return info;

  const currentUsers = Array.isArray(info.user_list)
    ? info.user_list.map(u => ({ user_id: String(u.user_id) }))
    : [];

  if (!currentUsers.some(u => u.user_id === '8497')) {
    const editUsers = [...currentUsers, { user_id: '8497' }];
    const startDate = (info.start_date || '').substring(0, 10);
    const startTime = (info.start_date || '').substring(11, 16) || undefined;
    const endDate = (info.end_date || '').substring(0, 10);
    const endTime = (info.end_date || '').substring(11, 16) || undefined;
    await client.call('schedule_edit', {
      schedule_id,
      name: info.name,
      start_date: startDate,
      ...(startTime ? { start_time: startTime } : {}),
      end_date: endDate,
      ...(endTime ? { end_time: endTime } : {}),
      is_regular: 0,
      ...flattenUserList(editUsers),
    });
  }

  return client.call('schedule_delete', { schedule_id });
}

async function getSchedulesMulti(client, { schedule_ids } = {}) {
  if (!schedule_ids) throw new Error('schedule_ids is required (comma-separated)');
  const ids = Array.isArray(schedule_ids) ? schedule_ids.join(',') : String(schedule_ids);
  return client.call('schedules_info', { schedule_ids: ids });
}

module.exports = { listSchedules, getSchedule, getSchedulesMulti, createSchedule, editSchedule, deleteSchedule };
