// Advent 2026: renders the Calendar (calendar.js) as week cards and tracks which Days are Done on this device.
(() => {
  const STORE_KEY = 'advent:v1';
  const WEEK_COLORS = [
    { bg: '#3b1820', accent: '#e830a0', bar: '#99275f' }, // Hope
    { bg: '#882656', accent: '#2b5c52', bar: '#2b6755' }, // Peace
    { bg: '#6e539a', accent: '#2a4592', bar: '#2c4795' }, // Joy
    { bg: '#94568e', accent: '#dc325e', bar: '#dd3462' }, // Love
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
  function flame(cls) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('viewBox', '0 0 60 120');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', '#flame');
    svg.append(use);
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
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', c.bg);
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
        style: { '--c': WEEK_COLORS[w].accent },
        'aria-pressed': String(w === shownWeek),
        'aria-label': `Week ${w + 1}: ${week.theme}`,
        'data-week': String(w),
      }, lit ? flame('candle-flame') : el('span', { class: 'candle-flame unlit' }),
      el('span', { class: 'candle-body' }),
      el('span', { class: 'candle-label' }, week.theme));
    };
    const christLit = t >= christmas;
    const christ = el('span', {
      class: 'candle christ' + (christLit ? ' lit' : ''),
      title: christLit ? 'The Christ candle' : 'The Christ candle is lit on Christmas Day',
    }, christLit ? flame('candle-flame') : el('span', { class: 'candle-flame unlit' }),
    el('span', { class: 'candle-body' }),
    el('span', { class: 'candle-label' }, 'Christ'));
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
        flame('card-flame'),
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
  const todayRow = document.getElementById('day-' + today());
  if (todayRow) requestAnimationFrame(() => todayRow.scrollIntoView({ block: 'center' }));

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  window.advent = { days, isDone, today };
})();
