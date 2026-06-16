const https = require('https');
const querystring = require('querystring');
const { URL } = require('url');

const BN_API_URL = 'https://buildynote.com/system/restApi/json';

class BuildynoteClient {
  constructor(apiToken) {
    this.apiToken = apiToken;
  }

  call(type, params = {}) {
    return new Promise((resolve, reject) => {
      const postData = querystring.stringify({ api_token: this.apiToken, type, ...params });
      const u = new URL(BN_API_URL);
      const req = https.request({
        hostname: u.hostname,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: 'parse_failed', raw: data.substring(0, 500) });
          }
        });
      });
      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  // 自分自身 (whoami): #3360 で追加された「APIトークンから本人を返す」エンドポイント。
  // 実機検証(2026-06-16)の結果、 本番実装は type=staff_current(POST) 形式。
  // (パス /system/restApi/json/staff/current は type 未指定扱いで 00003 を返すため使わない)
  // レスポンス例: { id, name, email, user_type, company_id, company_name,
  //               office[], department[], position[], is_admin }
  currentStaff() {
    return this.call('staff_current');
  }
}

module.exports = { BuildynoteClient };
