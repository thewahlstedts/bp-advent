# Advent 2026

A family PWA for BibleProject's Advent 2026 calendar: one Reading and Reflection Question per Day, Nov 29 – Dec 25. Vocabulary is in `GLOSSARY.md`; use those terms in code and copy.

Live: https://advent.thewahlstedts.com (GitHub Pages from `main`, root; `CNAME` holds the domain). Plain HTML/CSS/JS, no build step, no dependencies.

## Files

| File | What it is |
| --- | --- |
| `calendar.js` | The Calendar, word for word from the PDF. Next year: replace this file only. |
| `logos-refs.js` | Copied unchanged from `daily-reading`. `splitRefs()` turns a Reading into a `https://ref.ly/…` link, which opens the Logos app. |
| `app.js` | Renders the candle row, progress dots and the shown Week's card; Done is per device in `localStorage['advent:v1']`. Past Days can be marked Done, future Days cannot. `?date=YYYY-MM-DD` pretends it is that day (for testing). `WEEK_COLORS` are sampled from each Week's PDF page and drive the CSS variables for the layered background (`body::before`) and the candle tabs. `FLAMES` holds our own flame per Week (after the PDF's idea that each Week's flame differs) plus a Christmas one; each layer is its own path so `styles.css` can animate them separately. |
| `reminder.js` | Daily Reminder panel (Web Push, per device, no accounts). Subscribes, then POSTs to `advent-subscribe`: `save` (time, time zone, today's Done), `done` on every `donechange`, `delete` when turned off. Re-saves once per open. On iPhone only works from the Home Screen app. |
| `sw.js` | Offline: network first, cache after 3 s. **Bump `CACHE` whenever a `SHELL` file changes.** Shows `push` notifications; a tap opens `/#YYYY-MM-DD` (never a URL from the payload), which `app.js` scrolls to. |
| `supabase/functions/` | `advent-subscribe` (the subscription is the credential: changing or deleting a row needs its endpoint *and* auth secret; known push hosts only; max 300 rows) and `advent-remind` (cron, every 5 min: sends within the hour after each device's time during Advent, skips a Day already Done, deletes everything from Dec 26). Shared logic in `_shared/advent.ts`, tested by `tools/test_reminders.mjs`; `_shared/calendar.ts` is generated from `calendar.js` by `node tools/check.mjs --write`; `_shared/webpush.ts` is copied from `daily-reading`. |
| `img/` | `nativity.jpg` and `bibleproject-white.png` were extracted unedited from BibleProject's PDF; `icon*` is our own flame. |
| `tools/check.mjs` | CI checks (scripts parse, SHELL complete, no inline scripts, 27 Days with valid Logos links, CACHE bumped). Run `node tools/check.mjs --base origin/main` before pushing. |

## Rules

- CSP is `'self'` only: no inline scripts, styles set through `element.style.setProperty`, text added with DOM nodes (never `innerHTML`).
- BibleProject brand use follows https://bibleproject.com/brand/: logo unaltered (white version on dark); artwork unedited and never behind text; credit "From *Advent 2026* by BibleProject" with links, plus "Not affiliated with BibleProject". `noindex` + `robots.txt` keep the site out of search.

## Server (shared Supabase project `rnpuwanpgundhfmvzrne`, owned by `daily-reading`)

- The table `public.advent_reminders` (service role only) and the cron jobs `send-advent-reminders` (every 5 min) and `end-advent-reminders` (Dec 27: unschedules both and empties the table) come from a migration **in the `daily-reading` repo**, because the project has one migration history. Never run `supabase db push` or `config push` from this repo.
- Deploy functions from here: `supabase functions deploy advent-remind --project-ref rnpuwanpgundhfmvzrne --no-verify-jwt --use-api --yes < /dev/null` (same for `advent-subscribe`).
- Secrets: `ADVENT_VAPID_PUBLIC_KEY` (also in `reminder.js`), `ADVENT_VAPID_PRIVATE_KEY` (generate with `node ../daily-reading/tools/vapid_keys.mjs`), and the shared `REMINDER_CRON_SECRET`. New keys make every device re-subscribe on its next open.
- Read-only checks: `supabase db query --linked --read-only "<sql>"` from the `daily-reading` repo (needs `SUPABASE_DB_PASSWORD` from the keychain; see its CLAUDE.md). Cron call results are in `net._http_response`.
