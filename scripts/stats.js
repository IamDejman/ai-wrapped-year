#!/usr/bin/env node
// How many people use ai-wrapped-year, day by day since launch: runs counted by the share server,
// npm downloads and visits to aiyearwrapped.com. A source that can't be reached is left out and says why.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { HOME } from '../src/archive.js';

const LAUNCH = '2026-11-13';
const COUNTED = '2026-11-14'; // the first day runs were counted
const PACKAGE = 'ai-wrapped-year';
const DB = 'ai-wrapped-year-share';
const SHARE = path.join(import.meta.dirname, '..', 'share');
const POSTHOG = process.env.POSTHOG_HOST ?? 'https://us.posthog.com';
const PROJECT = process.env.POSTHOG_PROJECT_ID ?? '734526';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const execFileAsync = promisify(execFile);

/** Every day from launch to today, in UTC. */
function days() {
  const today = new Date().toISOString().slice(0, 10);
  const list = [];
  for (const d = new Date(LAUNCH); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) list.push(d.toISOString().slice(0, 10));
  return list;
}

/** Runs and machines per day from the share server's database. "Not you" leaves out this machine's run id. */
async function runs() {
  const file = path.join(HOME, 'count-id');
  const id = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
  const me = ID.test(id) ? id : ''; // checked, since it goes into the SQL
  const sql = [
    'SELECT day, SUM(runs) AS runs FROM runs GROUP BY day',
    `SELECT day, COUNT(*) AS machines, SUM(id != '${me}') AS others FROM seen GROUP BY day`,
    `SELECT COUNT(DISTINCT id) AS machines, COUNT(DISTINCT CASE WHEN id != '${me}' THEN id END) AS others FROM seen`,
    'SELECT version, SUM(runs) AS runs FROM runs GROUP BY version ORDER BY runs DESC',
    'SELECT (SELECT COUNT(*) FROM codes) AS codes, (SELECT COUNT(*) FROM cards) AS cards',
  ].join(';\n');
  try {
    const { stdout } = await execFileAsync('npx', ['--no', 'wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql], { cwd: SHARE, maxBuffer: 1 << 24 });
    const [byDay, seen, [total], versions, [shared]] = JSON.parse(stdout).map((r) => r.results);
    const machines = new Map(seen.map((s) => [s.day, s]));
    return { byDay: new Map(byDay.map((r) => [r.day, { runs: r.runs, ...machines.get(r.day) }])), total, versions, shared };
  } catch (err) {
    const lines = String(err.stderr || err.message).split('\n').map((l) => l.trim()).filter(Boolean);
    throw new Error(`${lines.find((l) => l.includes('ERROR')) ?? lines[0]}. It needs wrangler logged in: cd share && npm install && npx wrangler login`);
  }
}

/** Downloads per day from the npm registry. Each day's count comes out the next day. */
async function downloads(list) {
  const get = async (url) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    return res.json();
  };
  const [range, last] = await Promise.all([
    get(`https://api.npmjs.org/downloads/range/${list[0]}:${list.at(-1)}/${PACKAGE}`),
    get(`https://api.npmjs.org/downloads/point/last-day/${PACKAGE}`),
  ]);
  return new Map(range.downloads.filter((d) => d.day <= last.end).map((d) => [d.day, d.downloads]));
}

/** Page views, visitors and copied commands per day from PostHog, and where the views came from. */
async function visits() {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) throw new Error('set POSTHOG_API_KEY to a PostHog personal API key with query:read');
  const query = async (sql) => {
    const res = await fetch(`${POSTHOG}/api/projects/${PROJECT}/query/`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql } }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`PostHog answered ${res.status}${body.detail ? `: ${body.detail}` : ''}`);
    return body.results;
  };
  const since = `timestamp >= toDate('${LAUNCH}')`;
  const [byDay, from] = await Promise.all([
    query(`SELECT toString(toDate(timestamp)), countIf(event = '$pageview'), count(DISTINCT if(event = '$pageview', distinct_id, NULL)), countIf(event = 'command copied') FROM events WHERE ${since} GROUP BY 1`),
    query(`SELECT properties.$referring_domain, count() FROM events WHERE event = '$pageview' AND ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`),
  ]);
  return { byDay: new Map(byDay.map(([day, views, visitors, copied]) => [day, { views, visitors, copied }])), from };
}

const list = days();
const [r, n, v] = await Promise.allSettled([runs(), downloads(list), visits()]);
const ran = r.value;
const npm = n.value;
const site = v.value;

const rows = list.map((day) => {
  const counted = ran && day >= COUNTED ? (ran.byDay.get(day) ?? { runs: 0, machines: 0, others: 0 }) : {};
  const seen = site ? (site.byDay.get(day) ?? { views: 0, visitors: 0, copied: 0 }) : {};
  return [day, counted.runs, counted.machines, counted.others, npm?.get(day), seen.visitors, seen.views, seen.copied];
});
const total = (i) => {
  const values = rows.map((row) => row[i]).filter((x) => typeof x === 'number');
  return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
};
const head = ['Day', 'Runs', 'Machines', 'Not you', 'Downloads', 'Visitors', 'Views', 'Copied'];
const totals = ['Total', total(1), ran?.total.machines, ran?.total.others, total(4), total(5), total(6), total(7)];

const grid = [head, ...rows, totals].map((row) => row.map((x) => (x === undefined || x === null ? '-' : String(x))));
const width = head.map((_, i) => Math.max(...grid.map((row) => row[i].length)));
console.log(grid.map((row) => row.map((c, i) => (i ? c.padStart(width[i]) : c.padEnd(width[i]))).join('  ')).join('\n'));

const notes = [];
if (ran) {
  notes.push(`Versions run: ${ran.versions.map((x) => `${x.version} ${x.runs}`).join(', ') || '-'}`);
  notes.push(`Shared: friend codes ${ran.shared.codes}, card links ${ran.shared.cards}`);
}
if (site) notes.push(`Views from: ${site.from.map(([ref, count]) => `${ref === '$direct' ? 'direct' : ref} ${count}`).join(', ') || '-'}`);
for (const [name, s] of [['Runs', r], ['Downloads', n], ['Visits', v]]) {
  if (s.status === 'rejected') notes.push(`${name} left out: ${s.reason.message}`);
}
if (notes.length) console.log(`\n${notes.join('\n')}`);
