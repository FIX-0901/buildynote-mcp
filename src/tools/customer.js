// 顧客マスタ。新規・編集パラメータが多いがそのまま透過的に渡す。
module.exports = require('./_simpleMaster')('customer', 'customer_id', 'customer_ids');
