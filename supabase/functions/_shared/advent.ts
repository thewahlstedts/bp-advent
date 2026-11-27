// Advent Reminders: who is due and what the Reminder says. Pure functions, so
// tools/test_reminders.mjs can test them without Deno or a database.

export type Week = { theme: string; days: [string, string, string][] };
export type Calendar = { year: number; weeks: Week[] };
export type Row = {
  id: number; endpoint: string; p256dh: string; auth: string;
  at_minute: number; tz: string; done_on: string | null; last_sent: string | null;
};
export type Local = { date: string; minute: number };

// Push services the browsers we support use. Anything else is refused, so a
// row can't make the function send requests to arbitrary hosts.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];

export function isPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Date and minute of the day in a time zone.
export function localNow(now: Date, tz: string): Local | null {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

const allDays = (cal: Calendar) => cal.weeks.flatMap((w, week) => w.days.map(([date, reading, question]) => ({ date, reading, question, week })));
export const firstDate = (cal: Calendar) => cal.weeks[0].days[0][0];
export const lastDate = (cal: Calendar) => cal.weeks.at(-1)!.days.at(-1)![0];

// Due within the hour after its time, once a day. The window lets a late or
// skipped cron run catch up without sending at odd hours.
export const WINDOW = 60;

export function isDue(r: Row, local: Local): boolean {
  return local.minute >= r.at_minute && local.minute < r.at_minute + WINDOW && r.last_sent !== local.date;
}

export type Message = { title: string; body: string; date: string };

// The Reminder for this local date, or null when there's none
// (outside Advent, or that Day is already Done on the device).
export function reminderFor(cal: Calendar, r: Row, today: string): Message | null {
  if (r.done_on === today) return null;
  const days = allDays(cal);
  const i = days.findIndex((d) => d.date === today);
  if (i < 0) return null;
  const d = days[i];
  const theme = cal.weeks[d.week].theme;
  const title = today === `${cal.year}-12-25` ? `Merry Christmas · ${theme}` : `${theme} · Day ${i + 1}`;
  return { title, body: `${d.reading} — ${d.question}`, date: today };
}
