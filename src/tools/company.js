// 協力会社（読み取り専用：API仕様書に new/edit/delete が無いため）
const factory = require('./_simpleMaster')('company', 'company_id', 'company_ids', { multiType: 'companies_info' });
module.exports = {
  list: factory.list,
  info: factory.info,
  multi: factory.multi,
};
