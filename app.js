import {
  keyOf, parseKey, addDays, monthOf, addMonths, daysInMonth, monthRange, weekRange,
  parseEntry, editText, fmtPlain, fmtMoney, totals, groupByName, suggest,
  toCSV, sanitizeEntry, uid, toNumber,
} from './lib.js';

const STORE = 'spent.v1';
const $ = (id) => document.getElementById(id);
const el = {
  main: $('main'), page: $('page'), title: $('title'), sub: $('sub'), todayBtn: $('todayBtn'),
  list: $('list'), form: $('form'), input: $('input'), chips: $('chips'), hint: $('hint'),
  card: $('card'), cDay: $('cDay'), cDayLabel: $('cDayLabel'), cWeek: $('cWeek'), cMonth: $('cMonth'),
  cThird: $('cThird'), cThirdLabel: $('cThirdLabel'),
  menuBtn: $('menuBtn'), findBtn: $('findBtn'), scrim: $('scrim'),
  monthSheet: $('monthSheet'), mName: $('mName'), mPrev: $('mPrev'), mNext: $('mNext'),
  mTotal: $('mTotal'), mSub: $('mSub'), mBudget: $('mBudget'), mMeter: $('mMeter'), mLeft: $('mLeft'),
  mDaily: $('mDaily'), mBars: $('mBars'), mAxisStart: $('mAxisStart'), mAxisEnd: $('mAxisEnd'),
  mTopLabel: $('mTopLabel'), mTop: $('mTop'),
  menuSheet: $('menuSheet'), budget: $('budget'), currency: $('currency'), currencyValue: $('currencyValue'),
  exportBtn: $('exportBtn'), backupBtn: $('backupBtn'), restoreBtn: $('restoreBtn'),
  restoreFile: $('restoreFile'), eraseBtn: $('eraseBtn'),
  findSheet: $('findSheet'), findInput: $('findInput'), findSum: $('findSum'), findList: $('findList'),
  toast: $('toast'), toastText: $('toastText'), toastBtn: $('toastBtn'),
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const todayKey = () => keyOf(new Date());

/* ---------------- storage ---------------- */

const blank = () => ({ v: 1, entries: [], settings: { currency: 'USD', budget: null } });

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    const s = blank();
    if (!raw) return s;
    s.entries = (Array.isArray(raw.entries) ? raw.entries : []).map(sanitizeEntry).filter(Boolean);
    const st = raw.settings || {};
    if (typeof st.currency === 'string' && st.currency) s.settings.currency = st.currency;
    if (Number.isInteger(st.budget) && st.budget > 0) s.settings.budget = st.budget;
    return s;
  } catch {
    return blank();
  }
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify(state));
    return true;
  } catch {
    toast('Couldn’t save. Your phone’s storage may be full.');
    return false;
  }
}

let askedPersist = false;
function askPersist() {
  if (askedPersist) return;
  askedPersist = true;
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
}

/* ---------------- view state ---------------- */

let view = todayKey(); // the day on screen
let followToday = true; // roll over to the new day at midnight
let editingId = null;
let monthView = monthOf(view);
let openSheetEl = null;

const money = (cents, round = false) => fmtMoney(cents, state.settings.currency, { round });
const byDay = (day) => state.entries.filter((e) => e.date === day).sort((a, b) => a.at - b.at);
const between = (from, to) => state.entries.filter((e) => e.date >= from && e.date <= to);
const thisYear = () => new Date().getFullYear();

function dayTitle(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  const d = parseKey(k);
  const opts = d.getFullYear() === thisYear()
    ? { weekday: 'long', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

function shortDay(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  const d = parseKey(k);
  const opts = d.getFullYear() === thisYear()
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return new Intl.DateTimeFormat(undefined, opts).format(d);
}

const shortDate = (k) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(parseKey(k));

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const opts = y === thisYear() ? { month: 'long' } : { month: 'long', year: 'numeric' };
  return new Intl.DateTimeFormat(undefined, opts).format(new Date(y, m - 1, 1));
}

/* Count-up for totals, so a new entry visibly lands in the sum. */
const shown = new WeakMap();
function tween(node, value, fmt, animate) {
  const from = shown.get(node);
  shown.set(node, value);
  cancelAnimationFrame(node._raf);
  if (!animate || from === undefined || from === value || reduceMotion.matches) {
    node.textContent = fmt(value);
    return;
  }
  const whole = from % 100 === 0 && value % 100 === 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 420);
    let v = from + (value - from) * (1 - (1 - k) ** 3);
    v = whole ? Math.round(v / 100) * 100 : Math.round(v);
    node.textContent = fmt(k < 1 ? v : value);
    if (k < 1) node._raf = requestAnimationFrame(step);
  };
  node._raf = requestAnimationFrame(step);
}

/* ---------------- the day ---------------- */

function subText(out, inn, count) {
  if (!count) return view === todayKey() ? 'Nothing yet' : 'Nothing logged';
  const parts = [];
  if (out || !inn) parts.push(`${money(out)} spent`);
  if (inn) parts.push(`${money(inn)} in`);
  return parts.join(', ');
}

function rowEl(e, isNew) {
  const li = document.createElement('li');
  li.className = isNew ? 'row new' : 'row';
  li.dataset.id = e.id;
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = e.name;
  const amt = document.createElement('span');
  amt.className = 'amt';
  amt.textContent = (e.income ? '+' : '') + fmtPlain(e.cents);
  li.append(name, amt);
  return li;
}

function renderDay(opts = {}) {
  const items = byDay(view);
  const { out, inn } = totals(items);
  el.title.textContent = dayTitle(view);
  tween(el.sub, out, (v) => subText(v, inn, items.length), opts.animate);
  el.todayBtn.hidden = view === todayKey();
  el.input.placeholder = view === todayKey() ? 'Write an expense…' : `Add to ${shortDate(view)}…`;
  el.list.replaceChildren(...items.map((e) => rowEl(e, e.id === opts.flash)));
  renderCard(opts.animate);
  renderHint();
  if (openSheetEl === el.monthSheet) renderMonth();
}

function elapsedDays(ym) {
  const t = todayKey();
  const tm = monthOf(t);
  if (ym < tm) return daysInMonth(ym);
  if (ym > tm) return 0;
  return Number(t.slice(8));
}

function renderCard(animate) {
  const t = todayKey();
  const dayOut = totals(byDay(view)).out;
  const weekOut = totals(between(...weekRange(view))).out;
  const ym = monthOf(view);
  const monthOut = totals(between(...monthRange(ym))).out;

  tween(el.cDay, dayOut, (v) => money(v), animate);
  el.cDayLabel.textContent = view === t ? 'today’s total'
    : view === addDays(t, -1) ? 'yesterday’s total' : `${shortDate(view)} total`;
  tween(el.cWeek, weekOut, (v) => money(v, true), animate);
  tween(el.cMonth, monthOut, (v) => money(v, true), animate);

  const budget = state.settings.budget;
  if (budget) {
    const left = budget - monthOut;
    tween(el.cThird, Math.abs(left), (v) => money(v, true), animate);
    el.cThirdLabel.textContent = left >= 0 ? 'left' : 'over';
  } else {
    const days = elapsedDays(ym);
    shown.delete(el.cThird);
    el.cThird.textContent = days ? money(Math.round(monthOut / days), true) : '–';
    el.cThirdLabel.textContent = 'per day';
  }
}

let hintTimer;
function renderHint(message, warn = false) {
  clearTimeout(hintTimer);
  el.hint.classList.toggle('warn', !!message && warn);
  if (message) {
    el.hint.textContent = message;
    hintTimer = setTimeout(() => renderHint(), 4000);
    return;
  }
  el.hint.textContent = state.entries.length
    ? ''
    : 'Write what it was and what it cost, like “coffee 5.50”. Put + before money coming in, like “+2400 invoice”.';
}

/* ---------------- adding ---------------- */

function addEntry(p) {
  const e = { id: uid(), date: view, name: p.name, cents: p.cents, income: !!p.income, at: Date.now() };
  state.entries.push(e);
  if (!save()) {
    state.entries.pop();
    return;
  }
  renderDay({ animate: true, flash: e.id });
  askPersist();
}

const NUDGES = {
  'no-amount': 'Add what it cost, like “lunch 14”.',
  zero: 'The amount has to be more than zero.',
  'too-big': 'That amount is too large.',
};

function nudge(reason) {
  el.form.classList.remove('shake');
  void el.form.offsetWidth;
  el.form.classList.add('shake');
  renderHint(NUDGES[reason] || NUDGES['no-amount'], true);
}

el.form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const text = el.input.value;
  if (!text.trim()) return;
  const p = parseEntry(text);
  if (!p.ok) {
    nudge(p.reason);
    return;
  }
  addEntry(p);
  el.input.value = '';
  renderChips();
});

const keepFocus = (node) => {
  for (const type of ['pointerdown', 'mousedown']) node.addEventListener(type, (ev) => ev.preventDefault());
};

function renderChips() {
  const q = el.input.value.trim();
  if (document.activeElement !== el.input || /\d/.test(q)) {
    el.chips.replaceChildren();
    return;
  }
  el.chips.replaceChildren(...suggest(state.entries, q, 3).map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    const name = document.createElement('span');
    name.textContent = s.name;
    const amt = document.createElement('span');
    amt.className = 'chip-amt';
    amt.textContent = (s.income ? '+' : '') + fmtPlain(s.cents);
    b.append(name, amt);
    b.setAttribute('aria-label', `Add ${s.name}, ${fmtPlain(s.cents)}`);
    keepFocus(b);
    b.addEventListener('click', () => {
      addEntry({ name: s.name, cents: s.cents, income: s.income });
      el.input.value = '';
      renderChips();
    });
    return b;
  }));
  revealBelowInput();
}

/* With the keyboard up, nudge the page so the quick picks under the field stay visible. */
function revealBelowInput() {
  const vv = window.visualViewport;
  if (!vv || document.activeElement !== el.input) return;
  requestAnimationFrame(() => {
    const target = (el.chips.childElementCount ? el.chips : el.input).getBoundingClientRect();
    const visibleBottom = vv.offsetTop + vv.height;
    const over = target.bottom + 12 - visibleBottom;
    if (over > 0 && vv.height < window.innerHeight - 80) window.scrollBy({ top: over, behavior: 'smooth' });
  });
}

el.input.addEventListener('input', renderChips);
el.input.addEventListener('focus', renderChips);
el.input.addEventListener('blur', () => setTimeout(renderChips, 0));
window.visualViewport?.addEventListener('resize', revealBelowInput);

/* ---------------- editing ---------------- */

const findRow = (id) => [...el.list.children].find((li) => li.dataset.id === id);

function startEdit(id) {
  if (editingId) commitEdit();
  const e = state.entries.find((x) => x.id === id);
  const li = findRow(id);
  if (!e || !li) return;
  editingId = id;
  li.classList.add('editing');

  const input = document.createElement('input');
  input.className = 'edit';
  input.type = 'text';
  input.value = editText(e);
  input.enterKeyHint = 'done';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', 'Edit entry. Clear it to delete.');

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'del';
  del.setAttribute('aria-label', `Delete ${e.name}`);
  del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  keepFocus(del);
  del.addEventListener('click', () => removeEntry(id));

  li.replaceChildren(input, del);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      input.blur();
    } else if (ev.key === 'Escape') {
      editingId = null;
      renderDay();
    }
  });
  input.addEventListener('blur', () => {
    if (editingId === id) commitEdit();
  });
}

function commitEdit() {
  const id = editingId;
  if (!id) return;
  editingId = null;
  const text = findRow(id)?.querySelector('input')?.value ?? '';
  const e = state.entries.find((x) => x.id === id);
  if (!e) {
    renderDay();
    return;
  }
  if (!text.trim()) {
    removeEntry(id);
    return;
  }
  const p = parseEntry(text);
  if (p.ok) Object.assign(e, { name: p.name, cents: p.cents, income: p.income });
  else if (p.reason === 'no-amount' && p.name) e.name = p.name; // renamed but dropped the amount: keep it
  save();
  renderDay({ animate: true });
}

function removeEntry(id) {
  const i = state.entries.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (editingId === id) editingId = null;
  const [gone] = state.entries.splice(i, 1);
  save();
  renderDay({ animate: true });
  toast(`Deleted ${gone.name}`, 'Undo', () => {
    state.entries.push(gone);
    save();
    renderDay({ animate: true, flash: gone.id });
  });
}

el.list.addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  if (li && !li.classList.contains('editing')) startEdit(li.dataset.id);
});

/* Tapping the empty page below the list starts a new entry; tapping again puts the keyboard away. */
el.main.addEventListener('click', (ev) => {
  // composedPath, not target.closest: the tapped row or chip may already have been re-rendered
  const onSomething = ev.composedPath().some((n) => n instanceof Element && n.matches('.row, .chip, button, input, .hint'));
  if (onSomething) return;
  const active = document.activeElement;
  if (active && active.tagName === 'INPUT') {
    active.blur();
    return;
  }
  if (ev.clientY >= el.input.getBoundingClientRect().top - 8) el.input.focus();
});

/* Hide the summary card while the keyboard is up. */
function syncTyping() {
  const a = document.activeElement;
  document.body.classList.toggle('typing', !!a && a.tagName === 'INPUT' && el.main.contains(a));
}
document.addEventListener('focusin', syncTyping);
document.addEventListener('focusout', () => setTimeout(syncTyping, 0));

/* ---------------- moving between days ---------------- */

function goTo(day, dir = 0, fromX = 0) {
  const t = todayKey();
  if (day > t) day = t;
  if (editingId) commitEdit();
  if (day === view) {
    snapBack();
    return;
  }
  const apply = () => {
    view = day;
    followToday = day === t;
    renderDay();
    window.scrollTo(0, 0);
  };
  const p = el.page;
  if (!dir || reduceMotion.matches) {
    p.style.transform = '';
    p.style.opacity = '';
    apply();
    return;
  }
  p.style.transition = 'transform .14s ease-in, opacity .14s ease-in';
  p.style.transform = `translateX(${-dir * (Math.abs(fromX) + 36)}px)`;
  p.style.opacity = '0';
  setTimeout(() => {
    apply();
    p.style.transition = 'none';
    p.style.transform = `translateX(${dir * 36}px)`;
    void p.offsetWidth;
    p.style.transition = 'transform .3s var(--ease), opacity .22s ease-out';
    p.style.transform = '';
    p.style.opacity = '';
  }, 140);
}

function snapBack() {
  const p = el.page;
  p.style.transition = 'transform .3s var(--ease), opacity .2s';
  p.style.transform = '';
  p.style.opacity = '';
}

el.todayBtn.addEventListener('click', () => goTo(todayKey(), 1));

let swipe = null;
el.main.addEventListener('touchstart', (ev) => {
  swipe = null;
  if (ev.touches.length !== 1 || editingId || openSheetEl || document.activeElement === el.input) return;
  const t = ev.touches[0];
  swipe = { x: t.clientX, y: t.clientY, dx: 0, axis: null };
}, { passive: true });

el.main.addEventListener('touchmove', (ev) => {
  if (!swipe) return;
  const t = ev.touches[0];
  const dx = t.clientX - swipe.x;
  const dy = t.clientY - swipe.y;
  if (!swipe.axis) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    swipe.axis = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
    if (swipe.axis === 'x') el.page.style.transition = 'none';
  }
  if (swipe.axis !== 'x') return;
  ev.preventDefault();
  swipe.dx = dx < 0 && view >= todayKey() ? dx / 4 : dx; // resist swiping past today
  el.page.style.transform = `translateX(${swipe.dx}px)`;
  el.page.style.opacity = String(1 - Math.min(Math.abs(swipe.dx) / 500, 0.35));
}, { passive: false });

function endSwipe() {
  if (!swipe || swipe.axis !== 'x') {
    swipe = null;
    return;
  }
  const { dx } = swipe;
  swipe = null;
  if (dx > 64) goTo(addDays(view, -1), -1, dx);
  else if (dx < -64 && view < todayKey()) goTo(addDays(view, 1), 1, dx);
  else snapBack();
}
el.main.addEventListener('touchend', endSwipe);
el.main.addEventListener('touchcancel', endSwipe);

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && openSheetEl) {
    closeSheet();
    return;
  }
  const typing = document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
  if (typing || openSheetEl || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'ArrowLeft') goTo(addDays(view, -1), -1);
  else if (ev.key === 'ArrowRight' && view < todayKey()) goTo(addDays(view, 1), 1);
});

/* ---------------- sheets ---------------- */

const sheets = [el.monthSheet, el.menuSheet, el.findSheet];

function openSheet(sheet) {
  if (editingId) commitEdit();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  for (const s of sheets) {
    if (s === sheet) continue;
    s.classList.remove('open');
    s.inert = true;
    s.setAttribute('aria-hidden', 'true');
  }
  openSheetEl = sheet;
  sheet.inert = false;
  sheet.setAttribute('aria-hidden', 'false');
  sheet.style.transform = '';
  sheet.classList.add('open');
  el.scrim.classList.add('open');
  document.body.classList.add('sheet-open');
  el.main.inert = true;
}

function closeSheet() {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  if (sheet.contains(document.activeElement)) document.activeElement.blur();
  sheet.classList.remove('open', 'dragging');
  sheet.style.transform = '';
  sheet.inert = true;
  sheet.setAttribute('aria-hidden', 'true');
  el.scrim.classList.remove('open');
  el.scrim.style.opacity = '';
  document.body.classList.remove('sheet-open');
  el.main.inert = false;
}

el.scrim.addEventListener('click', closeSheet);

/* Pull a sheet down to close it. */
function draggable(sheet) {
  const body = sheet.querySelector('.sheet-body');
  let g = null;
  sheet.addEventListener('touchstart', (ev) => {
    g = null;
    if (ev.touches.length !== 1) return;
    const onTop = ev.target.closest('.sheet-grab, .sheet-top');
    if (!onTop && body.scrollTop > 0) return;
    g = { y: ev.touches[0].clientY, t: performance.now(), dy: 0, on: false, onTop: !!onTop };
  }, { passive: true });
  sheet.addEventListener('touchmove', (ev) => {
    if (!g) return;
    const d = ev.touches[0].clientY - g.y;
    if (!g.on) {
      if (d < -6) { // moving up: let the sheet content scroll
        g = null;
        return;
      }
      if (d <= 6) return;
      if (!g.onTop && body.scrollTop > 0) {
        g = null;
        return;
      }
      g.on = true;
      sheet.classList.add('dragging');
    }
    ev.preventDefault();
    g.dy = Math.max(0, d);
    sheet.style.transform = `translateY(${g.dy}px)`;
    el.scrim.style.opacity = String(Math.max(0, 1 - g.dy / 420));
  }, { passive: false });
  const end = () => {
    if (!g || !g.on) {
      g = null;
      return;
    }
    const { dy, t } = g;
    g = null;
    sheet.classList.remove('dragging');
    el.scrim.style.opacity = '';
    const speed = dy / Math.max(1, performance.now() - t);
    if (dy > 110 || speed > 0.65) closeSheet();
    else sheet.style.transform = '';
  };
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
}
sheets.forEach(draggable);

/* ---------------- month ---------------- */

function openMonth(ym) {
  monthView = ym;
  renderMonth();
  if (openSheetEl !== el.monthSheet) openSheet(el.monthSheet);
  el.monthSheet.querySelector('.sheet-body').scrollTop = 0;
}

el.card.addEventListener('click', () => openMonth(monthOf(view)));
let cardY = null;
el.card.addEventListener('touchstart', (ev) => { cardY = ev.touches[0].clientY; }, { passive: true });
el.card.addEventListener('touchmove', (ev) => {
  if (cardY !== null && cardY - ev.touches[0].clientY > 24) {
    cardY = null;
    openMonth(monthOf(view));
  }
}, { passive: true });

el.mPrev.addEventListener('click', () => {
  monthView = addMonths(monthView, -1);
  renderMonth();
});
el.mNext.addEventListener('click', () => {
  if (monthView >= monthOf(todayKey())) return;
  monthView = addMonths(monthView, 1);
  renderMonth();
});

function note(text) {
  const li = document.createElement('li');
  li.className = 'note';
  li.textContent = text;
  return li;
}

function renderMonth() {
  const ym = monthView;
  const t = todayKey();
  const tm = monthOf(t);
  const [from, to] = monthRange(ym);
  const items = between(from, to);
  const { out, inn } = totals(items);

  el.mName.textContent = monthLabel(ym);
  el.mTotal.textContent = money(out);
  el.mSub.textContent = (ym === tm ? 'spent this month' : `spent in ${monthLabel(ym)}`) + (inn ? `, ${money(inn)} in` : '');
  el.mNext.disabled = ym >= tm;

  const budget = state.settings.budget;
  el.mBudget.hidden = !budget || ym > tm;
  if (budget) {
    const left = budget - out;
    el.mMeter.style.width = `${Math.min(100, (out / budget) * 100)}%`;
    el.mLeft.textContent = left >= 0
      ? `${money(left, true)} left of ${money(budget, true)}`
      : `${money(-left, true)} over ${money(budget, true)}`;
    // What's left, spread over the rest of the month (today included)
    const daysLeft = daysInMonth(ym) - Number(t.slice(8)) + 1;
    el.mDaily.textContent = ym === tm && left > 0
      ? `${money(Math.floor(left / daysLeft), true)} a day for ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
      : '';
  }

  const perDay = new Array(daysInMonth(ym)).fill(0);
  for (const e of items) if (!e.income) perDay[Number(e.date.slice(8)) - 1] += e.cents;
  // One huge day (rent) shouldn't flatten the rest: clip it and mark it as running off the chart.
  const nonZero = perDay.filter(Boolean).sort((a, b) => a - b);
  let max = nonZero.length ? nonZero[nonZero.length - 1] : 1;
  if (nonZero.length >= 3) {
    const p90 = nonZero[Math.floor((nonZero.length - 1) * 0.9)];
    if (max > p90 * 2.5) max = p90 * 1.2;
  }
  el.mBars.replaceChildren(...perDay.map((cents, i) => {
    const k = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = [k === view && 'on', k > t && 'future', cents > max && 'clipped'].filter(Boolean).join(' ');
    b.disabled = k > t;
    b.setAttribute('aria-label', `${shortDay(k)}: ${money(cents)}`);
    const bar = document.createElement('i');
    if (cents) bar.style.height = `${Math.min(100, Math.max(4, (cents / max) * 100))}%`;
    b.append(bar);
    b.addEventListener('click', () => {
      closeSheet();
      goTo(k, k > view ? 1 : -1);
    });
    return b;
  }));
  el.mAxisStart.textContent = shortDate(from);
  el.mAxisEnd.textContent = shortDate(to);

  const groups = groupByName(items);
  el.mTopLabel.hidden = !groups.length;
  if (!groups.length) {
    el.mTop.replaceChildren(note(`Nothing spent in ${monthLabel(ym)} yet.`));
    return;
  }
  const rows = groups.slice(0, 10).map((g) => {
    const li = document.createElement('li');
    li.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = g.name;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = g.count > 1 ? `${g.count}×` : '';
    const amt = document.createElement('span');
    amt.className = 'amt';
    amt.textContent = fmtPlain(g.cents);
    li.append(name, count, amt);
    li.addEventListener('click', () => openFind(g.name));
    return li;
  });
  if (groups.length > 10) rows.push(note(`and ${groups.length - 10} more`));
  el.mTop.replaceChildren(...rows);
}

/* ---------------- search + past days ---------------- */

function openFind(q = '') {
  el.findInput.value = q;
  renderFind();
  openSheet(el.findSheet);
  el.findSheet.querySelector('.sheet-body').scrollTop = 0;
}

el.findBtn.addEventListener('click', () => openFind(''));
el.findInput.addEventListener('input', renderFind);
el.findInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    el.findInput.blur();
  }
});

function hitRow(title, meta, amount, day) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'hit';
  const main = document.createElement('span');
  main.className = 'hit-main';
  const t = document.createElement('span');
  t.className = 'hit-title';
  t.textContent = title;
  const m = document.createElement('span');
  m.className = 'hit-meta';
  m.textContent = meta;
  main.append(t, m);
  const a = document.createElement('span');
  a.className = 'amt';
  a.textContent = amount;
  b.append(main, a);
  b.addEventListener('click', () => {
    closeSheet();
    goTo(day, day > view ? 1 : -1);
  });
  return b;
}

function renderFind() {
  const raw = el.findInput.value.trim();
  const q = raw.toLocaleLowerCase();
  if (!q) {
    renderHistory();
    return;
  }
  const hits = state.entries
    .filter((e) => e.name.toLocaleLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const { out, inn } = totals(hits);
  el.findSum.textContent = hits.length
    ? `${hits.length} ${hits.length === 1 ? 'entry' : 'entries'}, ${money(out)} spent${inn ? `, ${money(inn)} in` : ''}`
    : `Nothing matches “${raw}”.`;
  el.findList.replaceChildren(...hits.slice(0, 400).map((e) =>
    hitRow(e.name, shortDay(e.date), (e.income ? '+' : '') + fmtPlain(e.cents), e.date)));
}

function renderHistory() {
  const days = new Map();
  for (const e of state.entries) {
    const d = days.get(e.date) ?? { out: 0, inn: 0, n: 0 };
    if (e.income) d.inn += e.cents;
    else d.out += e.cents;
    d.n += 1;
    days.set(e.date, d);
  }
  const keys = [...days.keys()].sort().reverse();
  el.findSum.textContent = keys.length ? '' : 'Days you log show up here.';
  const monthOut = new Map();
  for (const k of keys) monthOut.set(monthOf(k), (monthOut.get(monthOf(k)) ?? 0) + days.get(k).out);

  const nodes = [];
  let current = null;
  for (const k of keys) {
    const ym = monthOf(k);
    if (ym !== current) {
      current = ym;
      const head = document.createElement('div');
      head.className = 'month-head';
      const name = document.createElement('span');
      name.textContent = monthLabel(ym);
      const sum = document.createElement('span');
      sum.textContent = money(monthOut.get(ym), true);
      head.append(name, sum);
      nodes.push(head);
    }
    const d = days.get(k);
    nodes.push(hitRow(
      shortDay(k),
      `${d.n} ${d.n === 1 ? 'entry' : 'entries'}${d.inn ? `, ${money(d.inn)} in` : ''}`,
      d.out || !d.inn ? money(d.out) : `+${money(d.inn)}`,
      k,
    ));
  }
  el.findList.replaceChildren(...nodes);
}

/* ---------------- settings + data ---------------- */

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'JPY', 'CNY', 'KRW',
  'CHF', 'SEK', 'NOK', 'DKK', 'MXN', 'BRL', 'ZAR', 'THB', 'IDR', 'PHP', 'MYR', 'SAR', 'QAR', 'TRY', 'ILS', 'PLN'];

function fillCurrencies() {
  let names = null;
  try { names = new Intl.DisplayNames(undefined, { type: 'currency' }); } catch { /* older browsers */ }
  const options = [...new Set([state.settings.currency, ...CURRENCIES])]
    .map((code) => ({ code, label: names ? `${names.of(code)} (${code})` : code }))
    .sort((a, b) => a.label.localeCompare(b.label));
  el.currency.replaceChildren(...options.map(({ code, label }) => new Option(label, code)));
}

function syncSettings() {
  const b = state.settings.budget;
  if (document.activeElement !== el.budget) el.budget.value = b ? money(b) : '';
  el.currency.value = state.settings.currency;
  el.currencyValue.textContent = state.settings.currency;
}

el.menuBtn.addEventListener('click', () => {
  syncSettings();
  openSheet(el.menuSheet);
});

el.budget.addEventListener('focus', () => {
  const b = state.settings.budget;
  el.budget.value = b ? String(b / 100) : '';
});
el.budget.addEventListener('blur', () => {
  const raw = el.budget.value.replace(/[^\d.,]/g, '');
  const n = raw ? toNumber(raw) : NaN;
  state.settings.budget = n > 0 ? Math.round(n * 100) : null;
  save();
  syncSettings();
  renderCard();
});
el.budget.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    el.budget.blur();
  }
});

el.currency.addEventListener('change', () => {
  state.settings.currency = el.currency.value;
  save();
  syncSettings();
  renderDay();
});

async function shareFile(filename, type, text) {
  const file = new File([text], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

el.exportBtn.addEventListener('click', () => {
  if (!state.entries.length) {
    toast('Nothing to export yet');
    return;
  }
  shareFile(`spent-${todayKey()}.csv`, 'text/csv', toCSV(state.entries));
});

el.backupBtn.addEventListener('click', () => {
  const data = { app: 'spent', v: 1, saved: new Date().toISOString(), settings: state.settings, entries: state.entries };
  shareFile(`spent-backup-${todayKey()}.json`, 'application/json', JSON.stringify(data));
});

el.restoreBtn.addEventListener('click', () => el.restoreFile.click());

el.restoreFile.addEventListener('change', async () => {
  const file = el.restoreFile.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data?.entries;
    if (!Array.isArray(incoming)) throw new Error('not a backup');
    const have = new Set(state.entries.map((e) => e.id));
    let added = 0;
    for (const raw of incoming) {
      const e = sanitizeEntry(raw);
      if (e && !have.has(e.id)) {
        state.entries.push(e);
        have.add(e.id);
        added += 1;
      }
    }
    const st = data?.settings;
    if (st && typeof st === 'object') {
      if (typeof st.currency === 'string' && st.currency) state.settings.currency = st.currency;
      if (Number.isInteger(st.budget) && st.budget > 0) state.settings.budget = st.budget;
    }
    save();
    fillCurrencies();
    syncSettings();
    renderDay();
    toast(added ? `Restored ${added} ${added === 1 ? 'entry' : 'entries'}` : 'That backup has nothing new');
  } catch {
    toast('That file isn’t a Spent backup');
  } finally {
    el.restoreFile.value = '';
  }
});

el.eraseBtn.addEventListener('click', () => {
  if (!state.entries.length) {
    toast('There’s nothing to erase');
    return;
  }
  // eslint-disable-next-line no-alert
  if (!window.confirm('Erase all entries? This can’t be undone. Save a backup first if you might want them back.')) return;
  state.entries = [];
  save();
  closeSheet();
  renderDay();
  toast('All entries erased');
});

/* ---------------- toast ---------------- */

let toastTimer;
let toastAction = null;

function hideToast() {
  el.toast.classList.remove('show');
  toastAction = null;
}

function toast(text, actionLabel, action) {
  clearTimeout(toastTimer);
  el.toastText.textContent = text;
  el.toastBtn.hidden = !actionLabel;
  if (actionLabel) el.toastBtn.textContent = actionLabel;
  toastAction = action || null;
  el.toast.classList.add('show');
  toastTimer = setTimeout(hideToast, actionLabel ? 5000 : 2600);
}

keepFocus(el.toastBtn);
el.toastBtn.addEventListener('click', () => {
  const run = toastAction;
  clearTimeout(toastTimer);
  hideToast();
  run?.();
});

/* ---------------- new day, start up ---------------- */

function refreshForToday() {
  const t = todayKey();
  if (followToday && view !== t && !editingId) view = t;
  if (!editingId) renderDay();
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshForToday();
});
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) refreshForToday();
});
setInterval(() => {
  if (followToday && view !== todayKey() && !editingId && document.activeElement !== el.input) refreshForToday();
}, 60_000);

fillCurrencies();
syncSettings();
renderDay();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
