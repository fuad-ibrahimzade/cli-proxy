#!/usr/bin/env node

const { Command } = require('commander');
const { fetchProxies, initSourcesFile } = require('./proxy-fetcher');
const { loadUsed, markUsed, proxyKey } = require('./proxy-store');
const { findVerifiedProxy, runCommand } = require('./runner');
const path = require('path');

const program = new Command();

program
  .name('cli-proxy')
  .description('Route subprocess traffic through a free proxy via sing-box')
  .option('--proxies-file <path>', 'JSON file to track used proxies', 'used-proxies.json')
  .option('--countries <list>', 'Comma-separated country codes (e.g. "us,tr")')
  .option('--protocol <proto>', 'Proxy protocol: http, socks5, or all', 'all')
  .option('--sources-file <path>', 'JSON file with custom proxy sources', '')
  .option('--pool <n>', 'Max proxies to test per run', '200')
  .option('--init-sources', 'Create a sources.json template for custom sources')
  .argument('[command...]', 'Command to run through the proxy')
  .allowUnknownOption(true)
  .action(async (commandArgs, opts) => {
    if (opts.initSources) {
      initSourcesFile(opts.sourcesFile || undefined);
      console.log('Created sources.json — edit it to add custom proxy sources.');
      return;
    }

    if (!commandArgs.length) {
      program.help();
      return;
    }

    const proxiesFile = path.resolve(opts.proxiesFile);
    const countries = opts.countries
      ? opts.countries.split(',').map((c) => c.trim().toLowerCase())
      : [];
    const protocol = opts.protocol === 'all' ? null : opts.protocol;
    const poolSize = parseInt(opts.pool, 10);

    console.log(`Fetching ${protocol || 'all'} proxies...`);
    let proxies;
    try {
      proxies = await fetchProxies({ countries, protocol, sourcesFile: opts.sourcesFile || undefined });
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

    // Shuffle and cap pool
    fresh.sort(() => Math.random() - 0.5);
    const pool = fresh.slice(0, poolSize);

    const start = Date.now();
    console.log(`Verifying ${pool.length} proxies via sing-box (20 at a time)...`);

    const result = await findVerifiedProxy(pool, (batch, offset) => {
      console.log(`  Batch ${(offset / 20 + 1) | 0}: testing ${batch.length} proxies...`);
    });

    if (!result) {
      console.error('No proxy passed sing-box verification. Try again or increase --pool.');
      process.exit(1);
    }

    const total = ((Date.now() - start) / 1000).toFixed(1);
    markUsed(proxiesFile, result.proxy);
    console.log(`Using proxy: ${result.proxy.ip}:${result.proxy.port} (found in ${total}s)`);

    const [cmd, ...args] = commandArgs;
    const exitCode = await runCommand(cmd, args, result.singbox, result.port);
    process.exit(exitCode);
  });

program.parse();
