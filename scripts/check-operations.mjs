// Feed structured api_request logs; no cookies, raw URLs, SQL or user content required.
import { readFileSync } from 'node:fs';
import { operationAlerts } from '../lib/operational-metrics.mjs';
const path = process.argv[2];
if (!path) throw Error('Usage: node scripts/check-operations.mjs private-api-metrics.jsonl');
const samples = readFileSync(path, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((x) => {
    try {
      return JSON.parse(x);
    } catch {
      return null;
    }
  })
  .filter((x) => x?.event === 'api_request');
const report = operationAlerts(samples);
console.log(JSON.stringify(report, null, 2));
if (report.alerts.length) process.exitCode = 2;
