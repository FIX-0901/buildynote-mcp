// 社員・物件区分・業種区分の master 関連ツール。
// 社員は読み取りのみ（API仕様書に new/edit/delete が無い）。
const makeSimpleMaster = require('./_simpleMaster');

// 社員（user_list/user_info/users_info） — 後方互換のため個別関数を維持
const userFactory = makeSimpleMaster('user', 'user_id', 'user_ids');
async function listStaff(client) { return userFactory.list(client); }
async function getStaffInfo(client, args = {}) { return userFactory.info(client, args); }
async function getStaffInfoMulti(client, args = {}) { return userFactory.multi(client, args); }

// 物件区分（construction_type）— list は後方互換でラップ、それ以外も実装
const ct = makeSimpleMaster('construction_type', 'construction_type_id', 'construction_type_ids');
async function listConstructionTypes(client) { return ct.list(client); }
const getConstructionType = ct.info;
const getConstructionTypeMulti = ct.multi;
const createConstructionType = ct.create;
const editConstructionType = ct.edit;
const deleteConstructionType = ct.remove;

// 業種区分（industry_type）
const it = makeSimpleMaster('industry_type', 'industry_type_id', 'industry_type_ids');
async function listIndustryTypes(client) { return it.list(client); }
const getIndustryType = it.info;
const getIndustryTypeMulti = it.multi;
const createIndustryType = it.create;
const editIndustryType = it.edit;
const deleteIndustryType = it.remove;

module.exports = {
  listStaff,
  getStaffInfo,
  getStaffInfoMulti,
  listConstructionTypes,
  getConstructionType,
  getConstructionTypeMulti,
  createConstructionType,
  editConstructionType,
  deleteConstructionType,
  listIndustryTypes,
  getIndustryType,
  getIndustryTypeMulti,
  createIndustryType,
  editIndustryType,
  deleteIndustryType,
};
