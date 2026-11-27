// Advent Reminders (Web Push).
//
// Called every 5 minutes by the pg_cron job `send-advent-reminders` with the
// shared secret in `x-cron-secret` (the same Vault secret `daily-reading`'s
// reminders use). Sends each due Reminder once a day during Advent, naming the
// Day's Reading and Reflection Question, and skips devices where that Day is
// already Done. After Christmas Day it deletes every subscription.
//
// Secrets: REMINDER_CRON_SECRET, ADVENT_VAPID_PUBLIC_KEY, ADVENT_VAPID_PRIVATE_KEY.
// Uses the service role key the platform provides.

import { sendPush, type Vapid } from '../_shared/webpush.ts';
import { isDue, isPushEndpoint, lastDate, localNow, reminderFor, type Row } from '../_shared/advent.ts';
import { CALENDAR } from '../_shared/calendar.ts';

const APP_URL = 'https://advent.thewahlstedts.com/';
const env = (k: string) => Deno.env.get(k) ?? '';

async function db(path: string, init: RequestInit = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${env('SUPABASE_URL')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
  });
  if (!res.ok) throw new Error(`DB ${res.status}: ${await res.text()}`);
  return res.status === 204 || init.method === 'PATCH' || init.method === 'DELETE' ? null : res.json();
}

// Compare digests so the check takes the same time however much matches.
async function secretMatches(given: string, expected: string): Promise<boolean> {
  if (!expected) return false;
  const hash = async (s: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!(await secretMatches(req.headers.get('x-cron-secret') ?? '', env('REMINDER_CRON_SECRET')))) {
    return new Response('Forbidden', { status: 403 });
  }

  const vapid: Vapid = {
    publicKey: env('ADVENT_VAPID_PUBLIC_KEY'),
    privateKey: env('ADVENT_VAPID_PRIVATE_KEY'),
    subject: APP_URL,
  };
  const now = new Date();
  const rows: Row[] = await db('advent_reminders?select=id,endpoint,p256dh,auth,at_minute,tz,done_on,last_sent');

  // Advent is over everywhere once it's Dec 26 even on the earliest time zone (UTC-12).
  const latest = localNow(now, 'Etc/GMT+12');
  if (latest && latest.date > lastDate(CALENDAR)) {
    if (rows.length) await db('advent_reminders?id=gt.0', { method: 'DELETE' });
    return Response.json({ over: true, removed: rows.length });
  }

  const due = rows.flatMap((r) => {
    const local = localNow(now, r.tz);
    return local && isDue(r, local) ? [{ r, today: local.date }] : [];
  });

  const outcome = { due: due.length, sent: 0, skipped: 0, removed: 0, failed: 0 };
  await Promise.all(due.map(async ({ r, today }) => {
    const markSent = () => db(`advent_reminders?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ last_sent: today }) });
    const remove = () => db(`advent_reminders?id=eq.${r.id}`, { method: 'DELETE' });
    try {
      if (!isPushEndpoint(r.endpoint)) { outcome.removed++; return await remove(); }
      const message = reminderFor(CALENDAR, r, today);
      if (!message) { outcome.skipped++; return await markSent(); }
      const status = await sendPush(r, message, vapid);
      if (status === 404 || status === 410) { outcome.removed++; return await remove(); } // unsubscribed
      if (status >= 200 && status < 300) { outcome.sent++; return await markSent(); }
      outcome.failed++; // retried on the next run while still in the window
      console.error(`push ${r.id}: HTTP ${status}`);
    } catch (e) {
      outcome.failed++;
      console.error(`push ${r.id}:`, e instanceof Error ? e.message : e);
    }
  }));
  return Response.json(outcome);
});
