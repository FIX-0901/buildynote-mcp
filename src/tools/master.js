async function listStaff(client) {
  return client.call('user_list');
}

async function getStaffInfo(client, args = {}) {
  const { user_id } = args;
  if (!user_id) throw new Error('user_id is required');
  return client.call('user_info', { user_id });
}

async function getStaffInfoMulti(client, args = {}) {
  const ids = args.user_ids;
  if (!ids) throw new Error('user_ids is required (comma-separated, e.g. "1,3,5")');
  const user_ids = Array.isArray(ids) ? ids.join(',') : String(ids);
  return client.call('users_info', { user_ids });
}

async function listConstructionTypes(client) {
  return client.call('construction_type_list');
}

async function listIndustryTypes(client) {
  return client.call('industry_type_list');
}

module.exports = {
  listStaff,
  getStaffInfo,
  getStaffInfoMulti,
  listConstructionTypes,
  listIndustryTypes,
};
