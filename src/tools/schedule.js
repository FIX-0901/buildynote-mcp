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
  // 注意: 以前は FIXユーザー(8497) を必ず user_list に追加していたが、
  // 他社トークン(例: メガステップの島田)では他社ユーザー8497を予定に入れられず作成が失敗する。
  // マルチテナント運用では操作トークン本人が user_list に含まれていれば作成・削除できるため、
  // 8497 の強制追加は廃止し、 呼び出し側が指定した user_list をそのまま使う。
  return client.call('schedule_new', { ...rest, ...flattenUserList(users) });
}

async function editSchedule(client, { schedule_id, user_list, ...rest }) {
  if (rest.is_regular === undefined) rest.is_regular = 0;
  return client.call('schedule_edit', { schedule_id, ...rest, ...flattenUserList(user_list) });
}

async function deleteSchedule(client, { schedule_id }) {
  // schedule_delete は「操作トークンのユーザーが その予定の user_list に含まれている」場合に成功する。
  // 旧実装は FIXユーザー(8497) を強制的に追加してから削除していたが、 他社トークンでは
  // 8497 を追加できず失敗する。 マルチテナント運用では操作ユーザー本人が user_list にいる前提で
  // そのまま削除を試みる（自分が参加している予定を自分のトークンで削除する正しい挙動）。
  return client.call('schedule_delete', { schedule_id });
}

async function getSchedulesMulti(client, { schedule_ids } = {}) {
  if (!schedule_ids) throw new Error('schedule_ids is required (comma-separated)');
  const ids = Array.isArray(schedule_ids) ? schedule_ids.join(',') : String(schedule_ids);
  return client.call('schedules_info', { schedule_ids: ids });
}

module.exports = { listSchedules, getSchedule, getSchedulesMulti, createSchedule, editSchedule, deleteSchedule };
