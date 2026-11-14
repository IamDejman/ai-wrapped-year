// Counts each run, so the project can tell how many people use it.
// Sends the version and a random id made only for this. No totals, and not the id --compare uses.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HOME } from './archive.js';
import { SHARE } from './compare.js';

const OFF = ['DO_NOT_TRACK', 'AGENT_WRAPPED_NO_COUNT', 'CI'];
const NOTICE = 'Each run is counted: it sends the version and a random id, nothing else about you. Turn it off with --no-count or DO_NOT_TRACK=1.';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/** Whether runs are counted here: not when asked not to, and not on build machines. */
export const counting = (env = process.env) => !OFF.some((name) => env[name] && env[name] !== '0' && env[name] !== 'false');

/** Counts this run. Says so the first time, never throws, and gives up after two seconds. */
export async function countRun(version, { url = process.env.AGENT_WRAPPED_COUNT_URL ?? SHARE, home = HOME, say = console.error } = {}) {
  const file = path.join(home, 'count-id');
  try {
    let id = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
    if (!ID.test(id)) {
      id = crypto.randomUUID();
      say(NOTICE);
      fs.mkdirSync(home, { recursive: true });
      fs.writeFileSync(file, id);
    }
    await fetch(new URL('/v1/runs', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version, id }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Offline, or the folder can't be written: the wrap matters, the count doesn't.
  }
}
