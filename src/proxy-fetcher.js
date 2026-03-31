const https = require('https');

function fetchProxies({ countries = [], protocol = 'http' } = {}) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      request: 'displayproxies',
      protocol,
      timeout: '5000',
    });
    if (countries.length) {
      params.set('country', countries.join(','));
    }

    const url = `https://api.proxyscrape.com/v2/?${params}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const proxies = data
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && line.includes(':'))
          .map((line) => {
            const [ip, portStr] = line.split(':');
            const port = parseInt(portStr, 10);
            if (!ip || isNaN(port)) return null;
            return { protocol, ip, port };
          })
          .filter(Boolean);
        resolve(proxies);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = { fetchProxies };
