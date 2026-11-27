// Daily Reminder via Web Push, per device, no accounts. A web app can't schedule
// its own notification, so the `advent-remind` Edge Function sends it; this file
// subscribes the device and tells `advent-subscribe` the time, time zone and
// whether today's Day is already Done (so that evening's Reminder is skipped).
(() => {
  // Public half of the VAPID key pair (the private half is a function secret).
  const VAPID_PUBLIC_KEY = 'BFwEMU5jR84U309p0skKKm2rEXLTs09Xo8eW8gOs0JljRtZ8oD6YJGTyFuiI60WOYqG90p4NFrff20WGg1Lffb8';
  const API = 'https://rnpuwanpgundhfmvzrne.supabase.co/functions/v1/advent-subscribe';
  const KEY = 'advent:reminder';
  const DEFAULT_TIME = '18:30';
  const BLOCKED = 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.';

  const $ = (id) => document.getElementById(id);
  const section = $('remind');
  const toggle = $('remind-on');
  const timeInput = $('remind-time');
  const timeRow = $('remind-time-row');
  const hint = $('remind-hint');

  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { on: r.on === true, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(r.time) ? r.time : DEFAULT_TIME };
    } catch (e) {
      return { on: false, time: DEFAULT_TIME };
    }
  }
  let reminder = load();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(reminder)); } catch (e) { /* ignore */ } };

  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const advent = () => window.advent;
  const over = () => advent().today() > advent().lastDate;

  function unavailableReason() {
    if (!pushSupported()) {
      return isIos() && !isStandalone()
        ? 'On iPhone and iPad, add this to your Home Screen first (Share → Add to Home Screen), then turn reminders on there.'
        : 'This browser doesn’t support notifications.';
    }
    if (Notification.permission === 'denied') return BLOCKED;
    return '';
  }

  function render(message = '', isError = false) {
    section.hidden = over();
    const reason = unavailableReason();
    toggle.checked = reminder.on && !reason;
    toggle.disabled = Boolean(reason);
    timeInput.value = reminder.time;
    timeRow.hidden = !toggle.checked;
    hint.textContent = message || reason
      || (toggle.checked ? 'On for this phone, with that day’s reading and question. Skipped if you’ve already marked the day done.' : 'A notification on this phone with each day’s reading and question.');
    hint.classList.toggle('error', isError || reason === BLOCKED);
  }

  function keyBytes(b64url) {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  const sameKey = (a, b) => !a || (a.byteLength === b.length && new Uint8Array(a).every((x, i) => x === b[i]));

  async function subscription(create) {
    const reg = await navigator.serviceWorker.ready;
    const key = keyBytes(VAPID_PUBLIC_KEY);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub.options && sub.options.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    return sub;
  }

  async function call(body) {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
  const ids = (sub) => {
    const j = sub.toJSON();
    return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
  };
  const doneToday = () => (advent().isDone(advent().today()) ? advent().today() : null);

  async function save(create) {
    const sub = await subscription(create);
    if (!sub) throw new Error('No subscription');
    const { endpoint, p256dh, auth } = ids(sub);
    await call({
      action: 'save', endpoint, p256dh, auth, time: reminder.time,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone, doneOn: doneToday(),
    });
  }

  async function turnOn() {
    toggle.disabled = true;
    hint.textContent = 'Turning on…';
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { reminder.on = false; persist(); return render(perm === 'denied' ? BLOCKED : 'Reminders need notification permission.', true); }
      await save(true);
      reminder.on = true;
      persist();
      render();
    } catch (e) {
      reminder.on = false;
      persist();
      render('Couldn’t turn reminders on. Check your connection and try again.', true);
    }
  }

  async function turnOff() {
    reminder.on = false;
    persist();
    render();
    try {
      const sub = await subscription(false);
      if (sub) {
        const { endpoint, auth } = ids(sub);
        await call({ action: 'delete', endpoint, auth }).catch(() => {});
        await sub.unsubscribe();
      }
    } catch (e) { /* already gone */ }
  }

  toggle.addEventListener('change', () => (toggle.checked ? turnOn() : turnOff()));
  timeInput.addEventListener('change', async () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(timeInput.value)) return;
    reminder.time = timeInput.value;
    persist();
    if (!reminder.on) return;
    try { await save(false); render('Saved.'); } catch (e) { render('Couldn’t save the new time. Try again when you’re online.', true); }
  });

  // Marking today Done (or undoing it) tells the server whether to skip tonight.
  document.addEventListener('donechange', async () => {
    if (!reminder.on || unavailableReason()) return;
    try {
      const sub = await subscription(false);
      if (!sub) return;
      const { endpoint, auth } = ids(sub);
      await call({ action: 'done', endpoint, auth, doneOn: doneToday() });
    } catch (e) { /* the next save catches up */ }
  });

  render();
  // Re-save once per open: keeps the time zone current and recovers a renewed subscription.
  if (reminder.on && !unavailableReason() && !over()) save(true).catch(() => {});
})();
