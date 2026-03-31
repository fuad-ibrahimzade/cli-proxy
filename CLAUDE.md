# cli-proxy2 Project Guide

## What this project is
A Node.js CLI tool that fetches free proxies from multiple sources, verifies them through sing-box, and routes subprocess traffic through a working proxy.

## Key files
- `src/index.js` — CLI entry point using commander
- `src/proxy-fetcher.js` — multi-source fetching, self-healing sources, GitHub auto-discovery
- `src/proxy-store.js` — tracks used proxies in JSON file
- `src/proxy-tester.js` — fast parallel TCP pre-test (available but not used in main flow)
- `src/runner.js` — starts sing-box, verifies proxy through it, runs user command
- `src/singbox.js` — generates sing-box config (mixed inbound, http/socks outbound)
- `sources.json` — auto-managed proxy source list with health tracking
- `used-proxies.json` — list of already-used proxy ip:port strings

## Architecture decisions
- **sing-box mixed inbound** (not TUN) — TUN requires root and the old TUN config was removed in sing-box 1.12+. Mixed inbound on localhost works everywhere including Termux.
- **No pre-test step** — direct TCP pre-tests gave false positives. All verification goes through sing-box with a real HTTP request to httpbin.org.
- **Parallel verification** — 20 sing-box instances on ports 12080-12099 tested simultaneously per batch.
- **Self-healing sources** — sources track failCount/lastOk. 3 consecutive failures removes non-seed sources. GitHub code search discovers new sources each run.
- **Env var proxy routing** — subprocess gets HTTP_PROXY/HTTPS_PROXY/ALL_PROXY pointing to local sing-box port.

## Commands
- `npm install` — install dependencies
- `node src/index.js --help` — show usage
- `node src/index.js -- curl ifconfig.me` — basic test run

## Conventions
- No TypeScript, plain Node.js CommonJS modules
- Single dependency: commander
- All async operations use Promise-based patterns
