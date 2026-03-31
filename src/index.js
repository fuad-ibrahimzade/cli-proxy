#!/usr/bin/env node

const { Command } = require('commander');
const { fetchProxies } = require('./proxy-fetcher');
const { loadUsed, markUsed, proxyKey } = require('./proxy-store');
const { findWorkingProxy } = require('./proxy-tester');
const { findVerifiedProxy, runCommand } = require('./runner');
const path = require('path');

const program = new Command();

program
  .name('cli-proxy')
  .description('Route subprocess traffic through a free proxy via sing-box')
  .option('--proxies-file <path>', 'JSON file to track used proxies', 'used-proxies.json')
  .option('--countries <list>', 'Comma-separated country codes (e.g. "us,tr")')
  .option('--protocol <proto>', 'Proxy protocol: http or socks5', 'http')
  .option('--timeout <ms>', 'Proxy test timeout in ms', '1000')
  .argument('[command...]', 'Command to run through the proxy')
  .allowUnknownOption(true)
  .action(async (commandArgs, opts) => {
    if (!commandArgs.length) {
      program.help();
      return;
    }

    const proxiesFile = path.resolve(opts.proxiesFile);
    const countries = opts.countries
      ? opts.countries.split(',').map((c) => c.trim().toLowerCase())
      : [];
    const timeout = parseInt(opts.timeout, 10);

    console.log(`Fetching ${opts.protocol} proxies...`);
    let proxies;
    try {
      proxies = await fetchProxies({ countries, protocol: opts.protocol });
    } catch (err) {
      console.error(`Failed to fetch proxies: ${err.message}`);
      process.exit(1);
    }

    if (!proxies.length) {
      console.error('No proxies found. Try different countries or protocol.');
      process.exit(1);
    }

    const used = loadUsed(proxiesFile);
    const fresh = proxies.filter((p) => !used.has(proxyKey(p)));

    if (!fresh.length) {
      console.error('All fetched proxies have been used. Delete your proxies file to reset.');
      process.exit(1);
    }

    fresh.sort(() => Math.random() - 0.5);

    const start = Date.now();
    console.log(`Pre-testing ${fresh.length} proxies...`);
    const candidates = await findWorkingProxy(fresh, { timeoutMs: timeout });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`${candidates.length} candidates in ${elapsed}s. Verifying via sing-box (10 at a time)...`);

    if (!candidates.length) {
      console.error('No working unused proxy found.');
      process.exit(1);
    }

    const result = await findVerifiedProxy(candidates, (batch) => {
      console.log(`  Testing batch: ${batch.map((p) => p.ip + ':' + p.port).join(', ')}`);
    });

    if (!result) {
      console.error('No proxy passed sing-box verification.');
      process.exit(1);
    }

    const total = ((Date.now() - start) / 1000).toFixed(1);
    markUsed(proxiesFile, result.proxy);
    console.log(`Using proxy: ${result.proxy.ip}:${result.proxy.port} (total ${total}s)`);

    const [cmd, ...args] = commandArgs;
    const exitCode = await runCommand(cmd, args, result.singbox, result.port);
    process.exit(exitCode);
  });

program.parse();
