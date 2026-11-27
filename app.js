// Advent 2026: renders the Calendar (calendar.js) as week cards and tracks which Days are Done on this device.
(() => {
  const STORE_KEY = 'advent:v1';
  // Sampled from each Week's page of the PDF: base, the darker edge band, the
  // lighter brush strokes, a warm highlight, the tag and the video bar.
  const WEEK_COLORS = [
    { bg: '#3b1820', deep: '#220d12', stroke: '#66253c', glow: '#7a2d48', accent: '#e830a0', bar: '#99275f' }, // Hope
    { bg: '#882656', deep: '#6a1c43', stroke: '#af4f6f', glow: '#f2b58a', accent: '#2b5c52', bar: '#2b6755' }, // Peace
    { bg: '#6e539a', deep: '#5a4285', stroke: '#8a6cb8', glow: '#9a7cc6', accent: '#2a4592', bar: '#2c4795' }, // Joy
    { bg: '#94568e', deep: '#7b4783', stroke: '#ab5a8d', glow: '#e3a3c0', accent: '#dc325e', bar: '#dd3462' }, // Love
  ];

  // Flatten the Calendar into Days that know their Week.
  const days = [];
  CALENDAR.weeks.forEach((week, w) => {
    week.days.forEach(([date, reading, question]) => {
      days.push({ date, reading, question, week: w, number: days.length + 1 });
    });
  });
  const firstDate = days[0].date;
  const lastDate = days[days.length - 1].date;
  const christmas = `${CALENDAR.year}-12-25`;

  // ---- dates (all local time, as YYYY-MM-DD strings, which compare correctly as text) ----
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // ?date=YYYY-MM-DD pretends it is that day (for trying the app before or after Advent).
  const override = /^\d{4}-\d{2}-\d{2}$/.test(new URLSearchParams(location.search).get('date') || '')
    ? new URLSearchParams(location.search).get('date') : null;
  const today = () => override || ymd(new Date());
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const longDate = (s) => parseYmd(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  const shortDate = (s) => parseYmd(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // ---- Done, per device ----
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && typeof s === 'object' && s.done && typeof s.done === 'object') return s;
    } catch (e) { /* fall through */ }
    return { done: {} };
  }
  const state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
    document.dispatchEvent(new CustomEvent('donechange'));
  }
  const isDone = (date) => state.done[date] === true;
  function setDone(date, on) {
    if (on) state.done[date] = true; else delete state.done[date];
    save();
  }

  // ---- which Week to show ----
  function currentWeek() {
    const t = today();
    if (t < firstDate) return 0;
    if (t > lastDate) return CALENDAR.weeks.length - 1;
    return days.find((d) => d.date === t).week;
  }
  let shownWeek = currentWeek();
  const weekLit = (w) => today() >= CALENDAR.weeks[w].days[0][0];

  // ---- DOM helpers (text only, never innerHTML) ----
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (v === false || v == null) return;
        if (k === 'class') node.className = v;
        else if (k === 'style') Object.entries(v).forEach(([p, val]) => node.style.setProperty(p, val));
        else node.setAttribute(k, v === true ? '' : v);
      });
    }
    children.flat().forEach((c) => { if (c != null) node.append(c); });
    return node;
  }
  const SVG = 'http://www.w3.org/2000/svg';
  // Our own flames, one per Week, following the PDF's idea that each Week's flame differs:
  // Hope has a red rim on the right, Peace a red rim on the left and a small floating
  // teardrop, Joy is rounder with a yellow edge, Love is round with a larger floating
  // teardrop. Layers are separate paths so each can flicker on its own (see styles.css).
  // viewBox 0 0 60 120; every flame sits on y = 118, the top of the candle.
  const RED = '#ef4d19', ORANGE = '#f6a12c', GOLD = '#f9c633', YELLOW = '#f8f246';
  const ALMOND = 'M30 2C18 30 4 55 4 80c0 24 12 38 26 38s26-14 26-38C56 55 42 30 30 2z';
  const ROUND = 'M30 4C14 28 2 54 2 80c0 24 13 38 28 38s28-14 28-38C58 54 46 28 30 4z';
  const teardrop = (top, bottom, half) => {
    const mid = top + (bottom - top) * 0.6;
    return `M30 ${top}C${30 - half * 0.5} ${top + (mid - top) * 0.45} ${30 - half} ${mid - 4} ${30 - half} ${mid}`
      + `c0 ${(bottom - mid) * 0.7} ${half * 0.45} ${bottom - mid} ${half} ${bottom - mid}`
      + `s${half} ${-(bottom - mid) * 0.3} ${half} ${-(bottom - mid)}`
      + `C${30 + half} ${mid - 4} ${30 + half * 0.5} ${top + (mid - top) * 0.45} 30 ${top}z`;
  };
  const FLAMES = {
    0: [ // Hope
      ['flame-outer', RED, ALMOND],
      ['flame-body', ORANGE, 'M29 16C18 39 5 58 5 82c0 22 11 36 25 36 12 0 20-12 20-32 0-26-11-46-21-70z'],
      ['flame-inner', YELLOW, teardrop(50, 118, 16)],
    ],
    1: [ // Peace
      ['flame-outer', RED, ALMOND],
      ['flame-body', ORANGE, 'M31 18c11 22 24 42 24 64 0 22-11 36-25 36-12 0-20-12-20-32 0-26 11-46 21-68z'],
      ['flame-inner', YELLOW, teardrop(62, 118, 15)],
      ['flame-top', YELLOW, teardrop(32, 56, 5)],
    ],
    2: [ // Joy
      ['flame-outer', GOLD, ROUND],
      ['flame-body', ORANGE, 'M30.5 12c15 22 27.5 44 27.5 68 0 24-13 38-28 38-12 0-23-12-23-34 0-26 11-48 23.5-72z'],
      ['flame-inner', YELLOW, teardrop(48, 118, 17)],
    ],
    3: [ // Love
      ['flame-outer', ORANGE, ROUND],
      ['flame-inner', YELLOW, teardrop(64, 118, 17)],
      ['flame-top', YELLOW, teardrop(24, 62, 9)],
    ],
    christ: [ // Christmas: the brightest, all gold and yellow
      ['flame-outer', GOLD, ROUND],
      ['flame-body', '#fbd84a', 'M30 14c12 22 24 44 24 68 0 22-11 36-24 36s-24-14-24-36c0-24 12-46 24-68z'],
      ['flame-inner', YELLOW, teardrop(40, 118, 19)],
    ],
  };
  function flame(cls, kind) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', 'flame ' + cls);
    svg.setAttribute('viewBox', '0 0 60 120');
    svg.setAttribute('aria-hidden', 'true');
    (FLAMES[kind] || FLAMES[0]).forEach(([layer, fill, d]) => {
      const path = document.createElementNS(SVG, 'path');
      path.setAttribute('class', layer);
      path.setAttribute('fill', fill);
      path.setAttribute('d', d);
      svg.append(path);
    });
    const wick = document.createElementNS(SVG, 'path'); // red, with a slanted top
    wick.setAttribute('class', 'flame-wick');
    wick.setAttribute('fill', RED);
    wick.setAttribute('d', 'M27.5 118V92l5 3v23z');
    svg.append(wick);
    return svg;
  }
  const external = (href, cls, ...children) => el('a', { href, class: cls, target: '_blank', rel: 'noopener noreferrer' }, ...children);

  function readingLink(reading) {
    const part = splitRefs(reading).find((p) => p.url);
    if (!part) return el('span', { class: 'reading' }, reading);
    return external(part.url, 'reading', reading);
  }

  // ---- rendering ----
  function applyColors() {
    const c = WEEK_COLORS[shownWeek];
    document.body.style.setProperty('--bg', c.bg);
    document.body.style.setProperty('--accent', c.accent);
    document.body.style.setProperty('--bar', c.bar);
    document.body.style.setProperty('--deep', c.deep);
    document.body.style.setProperty('--stroke', c.stroke);
    document.body.style.setProperty('--glow', c.glow);
  }

  function renderCandles() {
    const nav = document.getElementById('candles');
    const t = today();
    const candle = (w) => {
      const week = CALENDAR.weeks[w];
      const lit = weekLit(w);
      return el('button', {
        type: 'button',
        class: 'candle' + (lit ? ' lit' : '') + (w === shownWeek ? ' current' : ''),
        style: { '--c': WEEK_COLORS[w].accent, '--panel': WEEK_COLORS[w].bg, '--panel-stroke': WEEK_COLORS[w].stroke },
        'aria-pressed': String(w === shownWeek),
        'aria-label': `Week ${w + 1}: ${week.theme}`,
        'data-week': String(w),
      }, lit ? flame('candle-flame', w) : el('span', { class: 'candle-flame unlit' }),
      el('span', { class: 'candle-body' }),
      el('span', { class: 'candle-label' }, el('span', { class: 'candle-week' }, `Week ${w + 1}`), week.theme));
    };
    const christLit = t >= christmas;
    const christ = el('span', {
      class: 'candle christ' + (christLit ? ' lit' : ''),
      title: christLit ? 'The Christ candle' : 'The Christ candle is lit on Christmas Day',
    }, christLit ? flame('candle-flame', 'christ') : el('span', { class: 'candle-flame unlit' }),
    el('span', { class: 'candle-body' }),
    el('span', { class: 'candle-label' }, el('span', { class: 'candle-week' }, 'Dec 25'), 'Christ'));
    nav.replaceChildren(candle(0), candle(1), christ, candle(2), candle(3));
  }

  function renderStatus() {
    const t = today();
    const greeting = document.getElementById('greeting');
    let msg = '';
    if (t < firstDate) {
      const n = Math.round((parseYmd(firstDate) - parseYmd(t)) / 86400000);
      msg = n === 1 ? 'Advent begins tomorrow.' : `Advent begins ${parseYmd(firstDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.`;
    } else if (t === christmas) {
      msg = 'Merry Christmas! Christ is born.';
    } else if (t > lastDate) {
      msg = 'Merry Christmas! Advent is complete.';
    }
    greeting.textContent = msg;
    greeting.hidden = !msg;

    const done = days.filter((d) => isDone(d.date)).length;
    const dots = el('ol', { class: 'dots', 'aria-hidden': 'true' }, days.map((d) => el('li', {
      class: 'dot' + (isDone(d.date) ? ' done' : '') + (d.date === t ? ' today' : ''),
      style: { '--c': WEEK_COLORS[d.week].accent },
    })));
    document.getElementById('progress').replaceChildren(dots, el('p', { class: 'count' }, `${done} of ${days.length} days done`));
  }

  function renderWeek() {
    const t = today();
    const week = CALENDAR.weeks[shownWeek];
    const rows = days.filter((d) => d.week === shownWeek).map((d) => {
      const future = d.date > t;
      const done = isDone(d.date);
      const isToday = d.date === t;
      return el('li', {
        class: 'day' + (isToday ? ' today' : '') + (done ? ' done' : '') + (future ? ' future' : ''),
        id: 'day-' + d.date,
      },
      el('div', { class: 'day-text' },
        el('p', { class: 'day-meta' },
          isToday ? el('span', { class: 'today-chip' }, 'Today') : null,
          el('span', { class: 'date' }, longDate(d.date)),
          el('span', { class: 'sep', 'aria-hidden': 'true' }, ' | '),
          readingLink(d.reading)),
        el('p', { class: 'question' }, d.question)),
      el('button', {
        type: 'button',
        class: 'done-btn',
        'data-date': d.date,
        'aria-pressed': String(done),
        'aria-label': done ? `Done: ${shortDate(d.date)}. Tap to undo.` : `Mark ${shortDate(d.date)} done`,
        disabled: future,
        title: future ? `You can mark this done on ${shortDate(d.date)}` : null,
      }, el('span', { class: 'check', 'aria-hidden': 'true' })));
    });

    const card = el('section', { class: 'week', 'aria-labelledby': 'week-title' },
      el('div', { class: 'week-head' },
        el('p', { class: 'kicker' }, CALENDAR.title),
        el('h1', { id: 'week-title' }, week.theme)),
      el('div', { class: 'candle-card' },
        flame('card-flame', shownWeek),
        el('span', { class: 'week-tag' }, `Week ${shownWeek + 1}`),
        el('ol', { class: 'days' }, rows),
        external(week.video, 'video-bar', `Watch the ${week.theme} video`)));
    document.getElementById('week').replaceChildren(card);
  }

  function render() {
    applyColors();
    renderCandles();
    renderStatus();
    renderWeek();
  }

  function renderAbout() {
    document.getElementById('about-intro').replaceChildren(...CALENDAR.intro.map((p) => el('p', null, p)));
  }

  // ---- events ----
  document.getElementById('candles').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-week]');
    if (!btn) return;
    shownWeek = Number(btn.dataset.week);
    render();
  });

  document.getElementById('week').addEventListener('click', (e) => {
    const btn = e.target.closest('button.done-btn');
    if (!btn || btn.disabled) return;
    const date = btn.dataset.date;
    if (date > today()) return;
    setDone(date, !isDone(date));
    render();
    const again = document.querySelector(`button.done-btn[data-date="${date}"]`);
    if (again) again.focus();
  });

  const about = document.getElementById('about');
  document.getElementById('about-open').addEventListener('click', () => about.showModal());
  document.getElementById('about-close').addEventListener('click', () => about.close());
  about.addEventListener('click', (e) => { if (e.target === about) about.close(); });

  // A new day may have started while the app sat in the background.
  let lastSeen = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || today() === lastSeen) return;
    lastSeen = today();
    shownWeek = currentWeek();
    render();
  });

  renderAbout();
  render();
  // #YYYY-MM-DD (from a tapped Reminder) shows that Day; otherwise today.
  function showDay(date) {
    const day = days.find((d) => d.date === date);
    if (day && day.week !== shownWeek) { shownWeek = day.week; render(); }
    const row = document.getElementById('day-' + date);
    if (row) requestAnimationFrame(() => row.scrollIntoView({ block: 'center' }));
  }
  const hashDate = () => (/^#(\d{4}-\d{2}-\d{2})$/.exec(location.hash) || [])[1];
  window.addEventListener('hashchange', () => { if (hashDate()) showDay(hashDate()); });
  showDay(hashDate() || today());

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.advent = { days, isDone, today, lastDate };
})();
