// Saves, updates and removes a device's Advent Reminder. No accounts: the push
// subscription itself is the credential. Its endpoint and auth secret are known
// only to the browser that made it, and changing or removing a row requires both.
//
// POST JSON, one of:
//   { action: 'save',   endpoint, p256dh, auth, time: 'HH:MM', tz, doneOn: 'YYYY-MM-DD' | null }
//   { action: 'done',   endpoint, auth, doneOn: 'YYYY-MM-DD' | null }
//   { action: 'delete', endpoint, auth }
// Uses the service role key the platform provides; the table has no other access.

import { isPushEndpoint, isTimeZone } from '../_shared/advent.ts';

const ALLOWED_ORIGINS = ['https://advent.thewahlstedts.com', 'http://127.0.0.1:8790', 'http://localhost:8790'];
const MAX_ROWS = 300; // a family app; caps what an abuser can make the cron job send
const env = (k: string) => Deno.env.get(k) ?? '';

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function db(path: string, init: RequestInit = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
const isKey = (v: unknown, max: number): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]+$/.test(v) && v.length <= max;
const toMinute = (v: unknown) => {
  const m = typeof v === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const headers = { ...cors(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > 4000) return reply(413, { error: 'Too large' });
    body = JSON.parse(text);
    if (!body || typeof body !== 'object') throw new Error();
  } catch {
    return reply(400, { error: 'Bad JSON' });
  }

  const { action, endpoint, auth } = body;
  if (!isPushEndpoint(endpoint)) return reply(400, { error: 'Unsupported push endpoint' });
  if (!isKey(auth, 100)) return reply(400, { error: 'Bad auth key' });
  const match = `endpoint=eq.${encodeURIComponent(endpoint)}&auth=eq.${encodeURIComponent(auth)}`;

  try {
    if (action === 'save') {
      const { p256dh, time, tz, doneOn } = body;
      const at_minute = toMinute(time);
      if (!isKey(p256dh, 200) || at_minute === null || !isTimeZone(tz) || (doneOn !== null && !isDate(doneOn))) {
        return reply(400, { error: 'Bad reminder' });
      }
      const existing = await db(`advent_reminders?select=id,auth&endpoint=eq.${encodeURIComponent(endpoint)}`);
      if (existing.length) {
        // Only the browser holding this subscription's auth secret may change it.
        if (existing[0].auth !== auth) return reply(403, { error: 'Forbidden' });
        await db(`advent_reminders?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ p256dh, at_minute, tz, done_on: doneOn }),
        });
      } else {
        if ((await countRows()) >= MAX_ROWS) return reply(429, { error: 'Full' });
        await db('advent_reminders', {
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ endpoint, p256dh, auth, at_minute, tz, done_on: doneOn }),
        });
      }
      return reply(200, { ok: true });
    }
    if (action === 'done') {
      const { doneOn } = body;
      if (doneOn !== null && !isDate(doneOn)) return reply(400, { error: 'Bad date' });
      await db(`advent_reminders?${match}`, { method: 'PATCH', body: JSON.stringify({ done_on: doneOn }) });
      return reply(200, { ok: true });
    }
    if (action === 'delete') {
      await db(`advent_reminders?${match}`, { method: 'DELETE' });
      return reply(200, { ok: true });
    }
    return reply(400, { error: 'Unknown action' });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    return reply(500, { error: 'Server error' });
  }
});

async function countRows(): Promise<number> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/advent_reminders?select=id`, {
    method: 'HEAD',
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' },
  });
  const range = res.headers.get('content-range') ?? '';
  return Number(range.split('/')[1]) || 0;
}
