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
}

module.exports = { BuildynoteClient };
