const http = require('http');

function testProxy(proxy, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: proxy.ip,
      port: proxy.port,
      path: 'http://httpbin.org/ip',
      method: 'GET',
      headers: { Host: 'httpbin.org' },
      timeout: timeoutMs,
    }, (res) => {
      res.resume(); // drain
      resolve(res.statusCode === 200 ? proxy : null);
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function findWorkingProxy(proxies, { timeoutMs = 1000 } = {}) {
  const results = await Promise.all(proxies.map((p) => testProxy(p, timeoutMs)));
  return results.filter(Boolean);
}

module.exports = { testProxy, findWorkingProxy };
