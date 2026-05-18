// 単純な「name + foreign_id」master 用の CRUD ファクトリ。
// base: 'department' のような型名のベース文字列
// idField: 'department_id' のような単一IDフィールド名
// idsField: 'department_ids' のような複数IDフィールド名
// opts.multiType: 複数取得の type 名を上書き（不規則複数形対応、例: 'companies_info'）
function makeSimpleMaster(base, idField, idsField, opts = {}) {
  const multiType = opts.multiType || `${base}s_info`;
  return {
    list: (client, args = {}) => client.call(`${base}_list`, args),
    info: (client, args = {}) => {
      if (!args[idField]) throw new Error(`${idField} is required`);
      return client.call(`${base}_info`, { [idField]: args[idField] });
    },
    multi: (client, args = {}) => {
      const v = args[idsField];
      if (!v) throw new Error(`${idsField} is required (comma-separated)`);
      const ids = Array.isArray(v) ? v.join(',') : String(v);
      return client.call(multiType, { [idsField]: ids });
    },
    create: (client, args = {}) => client.call(`${base}_new`, args),
    edit: (client, args = {}) => {
      if (!args[idField]) throw new Error(`${idField} is required`);
      return client.call(`${base}_edit`, args);
    },
    remove: (client, args = {}) => {
      if (!args[idField]) throw new Error(`${idField} is required`);
      return client.call(`${base}_delete`, { [idField]: args[idField] });
    },
  };
}

module.exports = makeSimpleMaster;
