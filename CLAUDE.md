# Advent 2026

A family PWA for BibleProject's Advent 2026 calendar: one Reading and Reflection Question per Day, Nov 29 – Dec 25. Vocabulary is in `GLOSSARY.md`; use those terms in code and copy.

Live: https://advent.thewahlstedts.com (GitHub Pages from `main`, root; `CNAME` holds the domain). Plain HTML/CSS/JS, no build step, no dependencies.

## Files

| File | What it is |
| --- | --- |
| `calendar.js` | The Calendar, word for word from the PDF. Next year: replace this file only. |
| `logos-refs.js` | Copied unchanged from `daily-reading`. `splitRefs()` turns a Reading into a `https://ref.ly/…` link, which opens the Logos app. |
| `app.js` | Renders the candle row, progress dots and the shown Week's card; Done is per device in `localStorage['advent:v1']`. Past Days can be marked Done, future Days cannot. `?date=YYYY-MM-DD` pretends it is that day (for testing). |
| `sw.js` | Offline: network first, cache after 3 s. **Bump `CACHE` whenever a `SHELL` file changes.** |
| `img/` | `nativity.jpg` and `bibleproject-white.png` were extracted unedited from BibleProject's PDF; `icon*` is our own flame. |
| `tools/check.mjs` | CI checks (scripts parse, SHELL complete, no inline scripts, 27 Days with valid Logos links, CACHE bumped). Run `node tools/check.mjs --base origin/main` before pushing. |

## Rules

- CSP is `'self'` only: no inline scripts, styles set through `element.style.setProperty`, text added with DOM nodes (never `innerHTML`).
- BibleProject brand use follows https://bibleproject.com/brand/: logo unaltered (white version on dark); artwork unedited and never behind text; credit "From *Advent 2026* by BibleProject" with links, plus "Not affiliated with BibleProject". `noindex` + `robots.txt` keep the site out of search.
- Stage 2 (planned): anonymous Web Push Reminders through the `daily-reading` Supabase project (`advent_reminders`, `advent-subscribe`, `advent-remind`), default 6:30 pm, skipped on Days already Done, only Nov 29 – Dec 25.
