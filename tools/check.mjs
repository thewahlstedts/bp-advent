// Repo checks, run in CI and before pushing: node tools/check.mjs [--base <git ref>]
// - every script parses
// - every local file index.html loads is in the service worker's SHELL, and every SHELL file exists
// - no inline scripts or on…= handlers (the CSP forbids them)
// - the Calendar is well formed: 27 consecutive Days, every Reading becomes a ref.ly link
// - if a SHELL file changed since --base, the CACHE name in sw.js changed too
// - supabase/functions/_shared/calendar.ts matches calendar.js (--write regenerates it)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const errors = [];
const fail = (m) => errors.push(m);

const scripts = ['app.js', 'calendar.js', 'logos-refs.js', 'sw.js', 'tools/check.mjs'];
for (const f of scripts) {
  if (f.endsWith('.mjs')) continue;
  try { new vm.Script(readFileSync(f, 'utf8'), { filename: f }); } catch (e) { fail(`${f} does not parse: ${e.message}`); }
}

const sw = readFileSync('sw.js', 'utf8');
const shell = JSON.parse('[' + /const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].replace(/'/g, '"').replace(/,\s*$/, '') + ']');
const cacheName = /const CACHE = '([^']+)'/.exec(sw)[1];
for (const f of shell) if (f !== './' && !existsSync(f)) fail(`sw.js SHELL lists missing file ${f}`);

const html = readFileSync('index.html', 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|mailto:)/.test(u));
for (const r of new Set(refs)) if (!shell.includes(r)) fail(`index.html loads ${r}, which is not in sw.js SHELL`);
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) fail('index.html has an inline <script>');
if (/\son[a-z]+=/i.test(html)) fail('index.html has an inline on…= handler');

const { CALENDAR } = require('../calendar.js');
const { splitRefs } = require('../logos-refs.js');
const all = CALENDAR.weeks.flatMap((w) => w.days);
if (CALENDAR.weeks.length !== 4) fail('Calendar should have 4 Weeks');
if (all.length !== 27) fail(`Calendar has ${all.length} Days, expected 27`);
all.forEach(([date, reading, question], i) => {
  if (i > 0) {
    const prev = new Date(all[i - 1][0] + 'T12:00:00Z');
    const next = new Date(prev.getTime() + 86400000).toISOString().slice(0, 10);
    if (date !== next) fail(`Day ${date} should be ${next}`);
  }
  const link = splitRefs(reading).find((p) => p.url);
  if (!link || !/^https:\/\/ref\.ly\/[1-3]?[A-Za-z]+\d+(\.\d+(-\d+)?)?$/.test(link.url)) fail(`Reading "${reading}" on ${date} has no valid Logos link`);
  if (!question || !question.trim().endsWith('?') && !question.trim().endsWith('.')) fail(`Day ${date} has no Reflection Question`);
});
if (all.at(-1)[0] !== `${CALENDAR.year}-12-25`) fail('The last Day should be Christmas Day');

// The Reminder function needs the Calendar too; it gets a generated copy.
const CAL_TS = 'supabase/functions/_shared/calendar.ts';
const calTs = '// Generated from calendar.js by `node tools/check.mjs --write`. Do not edit.\n'
  + "import type { Calendar } from './advent.ts';\n\n"
  + 'export const CALENDAR: Calendar = '
  + JSON.stringify({ year: CALENDAR.year, weeks: CALENDAR.weeks.map((w) => ({ theme: w.theme, days: w.days })) }, null, 2) + ';\n';
if (process.argv.includes('--write')) writeFileSync(CAL_TS, calTs);
else if (!existsSync(CAL_TS) || readFileSync(CAL_TS, 'utf8') !== calTs) fail(`${CAL_TS} is out of date: run node tools/check.mjs --write`);

const baseIdx = process.argv.indexOf('--base');
if (baseIdx > 0) {
  const base = process.argv[baseIdx + 1];
  const changed = execFileSync('git', ['diff', '--name-only', base, '--'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const shellChanged = changed.filter((f) => shell.includes(f) || (f === 'index.html'));
  if (shellChanged.length) {
    let oldSw = '';
    try { oldSw = execFileSync('git', ['show', `${base}:sw.js`], { encoding: 'utf8' }); } catch (e) { /* new file */ }
    const oldName = (/const CACHE = '([^']+)'/.exec(oldSw) || [])[1];
    if (oldName === cacheName) fail(`${shellChanged.join(', ')} changed but CACHE in sw.js is still '${cacheName}'`);
  }
}

if (errors.length) { console.error(errors.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
console.log(`✓ checks passed (${all.length} Days, cache ${cacheName})`);
