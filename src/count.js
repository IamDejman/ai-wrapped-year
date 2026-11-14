// One anonymous count per run, so the project can tell how many people use it.
// Sends the version and whether this is the machine's first counted run. No id, no totals.
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './archive.js';
import { SHARE } from './compare.js';

const OFF = ['DO_NOT_TRACK', 'AGENT_WRAPPED_NO_COUNT', 'CI'];
const NOTICE = 'Each run adds one to an anonymous count: the version and nothing about you. Turn it off with --no-count or DO_NOT_TRACK=1.';

/** Whether runs are counted here: not when asked not to, and not on build machines. */
export const counting = (env = process.env) => !OFF.some((name) => env[name] && env[name] !== '0' && env[name] !== 'false');

/** Counts this run. Says so the first time, never throws, and gives up after two seconds. */
export async function countRun(version, { url = process.env.AGENT_WRAPPED_COUNT_URL ?? SHARE, home = HOME, say = console.error } = {}) {
  const marker = path.join(home, 'counted');
  try {
    const seen = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null;
    if (seen === null) {
      say(NOTICE);
      fs.mkdirSync(home, { recursive: true });
      fs.writeFileSync(marker, '');
    }
    const first = seen !== 'sent';
    const res = await fetch(new URL('/v1/runs', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, first }),
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok && first) fs.writeFileSync(marker, 'sent');
  } catch {
    // Offline, or the folder can't be written: the wrap matters, the count doesn't.
  }
}
