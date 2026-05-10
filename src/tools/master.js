async function listStaff(client) {
  return client.call('user_list');
}

async function listConstructionTypes(client) {
  return client.call('construction_type_list');
}

async function listIndustryTypes(client) {
  return client.call('industry_type_list');
}

module.exports = { listStaff, listConstructionTypes, listIndustryTypes };
