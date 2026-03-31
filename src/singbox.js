const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function generateConfig(proxy, configPath, localPort = 12080) {
  const config = {
    log: { level: 'warn' },
    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: localPort,
      },
    ],
    outbounds: [
      {
        type: proxy.protocol === 'socks5' ? 'socks' : 'http',
        tag: 'proxy-out',
        server: proxy.ip,
        server_port: proxy.port,
        ...(proxy.protocol === 'socks5' ? { version: '5' } : {}),
      },
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules: [],
      final: 'proxy-out',
    },
  };

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function startSingBox(configPath) {
  const child = spawn('sing-box', ['run', '-c', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

module.exports = { generateConfig, startSingBox };
