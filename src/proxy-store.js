const fs = require('fs');
const path = require('path');

function proxyKey(proxy) {
  return `${proxy.ip}:${proxy.port}`;
}

function loadUsed(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return new Set(Array.isArray(data) ? data : []);
  } catch {
    return new Set();
  }
}

function saveUsed(filePath, usedSet) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify([...usedSet], null, 2));
}

function markUsed(filePath, proxy) {
  const used = loadUsed(filePath);
  used.add(proxyKey(proxy));
  saveUsed(filePath, used);
}

function isUsed(filePath, proxy) {
  const used = loadUsed(filePath);
  return used.has(proxyKey(proxy));
}

module.exports = { proxyKey, loadUsed, saveUsed, markUsed, isUsed };
