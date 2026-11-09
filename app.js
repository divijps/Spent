import {
  keyOf, parseKey, addDays, monthOf, addMonths, daysInMonth, monthRange,
  parseEntry, editText, fmtPlain, fmtMoney, totals, groupByName, suggest, habits, isFlex,
  toCSV, sanitizeEntry, sanitizeBill, sanitizeCard, uid, toNumber,
  occurrences, monthlyCost, minPayment, allocate, payoff,
} from './lib.js';

const STORE = 'spent.v1'; // same key as the first version, so existing entries carry over
const $ = (id) => document.getElementById(id);
const el = {
  main: $('main'), page: $('page'), title: $('title'), sub: $('sub'), goToday: $('goToday'), tip: $('tip'),
  strip: $('strip'), stripDays: $('stripDays'), stripDone: $('stripDone'),
  list: $('list'), form: $('form'), input: $('input'), chips: $('chips'), hint: $('hint'),
  card: $('card'), cardHint: $('cardHint'), ring: $('ring'), ringArc: $('ringArc'),
  cMain: $('cMain'), cMainLabel: $('cMainLabel'), cStats: $('cStats'),
  menuBtn: $('menuBtn'), findBtn: $('findBtn'), scrim: $('scrim'), drawer: $('drawer'), shade: $('shade'),
  entrySheet: $('entrySheet'), eText: $('eText'), eMore: $('eMore'), ePop: $('ePop'), eDelete: $('eDelete'),
  ePanel: $('ePanel'), eActions: $('eActions'), eNudge: $('eNudge'), mBills: $('mBills'), mSettings: $('mSettings'),
  monthSheet: $('monthSheet'), mName: $('mName'), mPrev: $('mPrev'), mNext: $('mNext'),
  mBig: $('mBig'), mSub: $('mSub'), mBudget: $('mBudget'), mFixed: $('mFixed'), mFlex: $('mFlex'),
  mFixedLabel: $('mFixedLabel'), mFlexLabel: $('mFlexLabel'), mSetBudget: $('mSetBudget'),
  mInsights: $('mInsights'), mBars: $('mBars'), mAxisStart: $('mAxisStart'), mAxisEnd: $('mAxisEnd'),
  mSoonLabel: $('mSoonLabel'), mSoon: $('mSoon'), mTopLabel: $('mTopLabel'), mTop: $('mTop'),
  menuSheet: $('menuSheet'), budget: $('budget'), currency: $('currency'), currencyValue: $('currencyValue'),
  billsBtn: $('billsBtn'), billsCount: $('billsCount'),
  exportBtn: $('exportBtn'), backupBtn: $('backupBtn'), restoreBtn: $('restoreBtn'),
  restoreFile: $('restoreFile'), eraseBtn: $('eraseBtn'),
  billsSheet: $('billsSheet'), billsBody: $('billsBody'),
  findSheet: $('findSheet'), findInput: $('findInput'), findSum: $('findSum'), findList: $('findList'),
  toast: $('toast'), toastText: $('toastText'), toastBtn: $('toastBtn'),
};

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const todayKey = () => keyOf(new Date());

/** h('span.name', 'text') — tag with classes, then text, nodes, arrays or an attributes object. */
function h(tag, ...parts) {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name);
  if (classes.length) node.className = classes.join(' ');
  for (const p of parts.flat()) {
    if (p == null || p === false || p === '') continue;
    if (p instanceof Node) node.append(p);
    else if (typeof p !== 'object') node.append(String(p));
    else {
      for (const [k, v] of Object.entries(p)) {
        if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (v === true) node.setAttribute(k, '');
        else if (v !== false && v != null) node.setAttribute(k, v);
      }
    }
  }
  return node;
}

const REPEAT_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.75 6.5a5.25 5.25 0 0 1 9.5-2.35M12.6 1.5v2.9H9.7M13.25 9.5a5.25 5.25 0 0 1-9.5 2.35M3.4 14.5v-2.9h2.9"/></svg>';
function repeatIcon() {
  const s = h('span.rep', { title: 'Repeats automatically' });
  s.innerHTML = REPEAT_ICON;
  return s;
}

/* ---------------- storage ---------------- */

const blank = () => ({
  v: 2,
  entries: [],
  bills: [],
  cards: [],
  settings: { currency: 'USD', budget: null, cardMonthly: null },
  ui: { tipSeen: false, cardOpens: 0, edited: false },
});
const arr = (x) => (Array.isArray(x) ? x : []);
const posInt = (n) => Number.isInteger(n) && n > 0;

function load() {
  const s = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw) return s;
    s.entries = arr(raw.entries).map(sanitizeEntry).filter(Boolean);
    s.bills = arr(raw.bills).map(sanitizeBill).filter(Boolean);
    s.cards = arr(raw.cards).map(sanitizeCard).filter(Boolean);
    const st = raw.settings || {};
    if (typeof st.currency === 'string' && st.currency) s.settings.currency = st.currency;
    if (posInt(st.budget)) s.settings.budget = st.budget;
    if (posInt(st.cardMonthly)) s.settings.cardMonthly = st.cardMonthly;
    if (raw.ui?.tipSeen === true) s.ui.tipSeen = true;
    if (raw.ui?.edited === true) s.ui.edited = true;
    if (Number.isInteger(raw.ui?.cardOpens)) s.ui.cardOpens = raw.ui.cardOpens;
  } catch { /* unreadable: start fresh */ }
  return s;
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

/* ---------------- words and numbers ---------------- */

const money = (cents, round = false) => fmtMoney(cents, state.settings.currency, { round });
const fmt = (opts) => new Intl.DateTimeFormat(undefined, opts);
const thisYear = () => new Date().getFullYear();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const shortName = (name) => name.replace(/ payment$/, '');
const shortDate = (k) => fmt({ month: 'short', day: 'numeric' }).format(parseKey(k));
const monthShort = (ym) => fmt({ month: 'short' }).format(parseKey(`${ym}-01`));

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function dayTitle(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  const d = parseKey(k);
  if (k > addDays(t, -7)) return fmt({ weekday: 'long' }).format(d);
  return fmt(d.getFullYear() === thisYear()
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function shortDay(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k === addDays(t, -1)) return 'Yesterday';
  const d = parseKey(k);
  return fmt(d.getFullYear() === thisYear()
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return fmt(y === thisYear() ? { month: 'long' } : { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

/** 'today', 'tomorrow', 'Thu', or 'Dec 1' */
function when(k) {
  const t = todayKey();
  if (k === t) return 'today';
  if (k === addDays(t, 1)) return 'tomorrow';
  if (k > t && k <= addDays(t, 6)) return fmt({ weekday: 'short' }).format(parseKey(k));
  return shortDate(k);
}

/* ---------------- view state ---------------- */

let view = todayKey(); // the day on screen
let followToday = true; // roll over to the new day at midnight
let stripOpen = false; // the row of days under the date
let entryId = null; // the entry open in the details sheet
let monthView = monthOf(view);
let openSheetEl = null;

const byDay = (day) => state.entries.filter((e) => e.date === day).sort((a, b) => a.at - b.at);
const inMonth = (ym) => {
  const [a, b] = monthRange(ym);
  return state.entries.filter((e) => e.date >= a && e.date <= b);
};

/* ---------------- bills, cards and the daily limit ---------------- */

const nextFrom = (item) => (item.last ? addDays(item.last, 1) : item.start);
const later = (a, b) => (a > b ? a : b);
const cardRule = (c) => ({ start: c.start, every: 'month' });
const byDate = (a, b) => a.date.localeCompare(b.date);

/** Usual everyday spending per month, from up to three recent months (scaled up if logging started mid-month). */
function usualSpending() {
  const t = todayKey();
  const first = state.entries.reduce((m, e) => (e.date < m ? e.date : m), t);
  const sums = [];
  for (let i = 1; i <= 3; i += 1) {
    const ym = addMonths(monthOf(t), -i);
    const [from, to] = monthRange(ym);
    if (first > to) break;
    const tracked = daysInMonth(ym) - Number(later(from, first).slice(8)) + 1;
    if (tracked < 7) continue;
    const spent = totals(inMonth(ym).filter(isFlex)).out;
    sums.push(Math.round((spent * daysInMonth(ym)) / tracked));
  }
  return sums.length ? Math.round(sums.reduce((a, b) => a + b, 0) / sums.length) : null;
}

const billsPerMonth = () => state.bills.reduce((s, b) => s + monthlyCost(b), 0);
const cardMinimums = () => state.cards.reduce((s, c) => s + minPayment(c), 0);

/** What the budget has room for after bills and usual spending (plus a 10% cushion); null until there's a month to learn from. */
function cardRoom() {
  const B = state.settings.budget;
  const usual = usualSpending();
  if (!B || usual == null) return null;
  return Math.max(0, Math.floor((B - billsPerMonth() - Math.round(usual * 1.1)) / 1000) * 1000);
}

/** Monthly amount for cards: the one you set, or Auto. Never below the minimums. */
function cardMonthly() {
  return Math.max(cardMinimums(), state.settings.cardMonthly ?? cardRoom() ?? 0);
}

/** Payments for cards that haven't been added to the log yet this month. */
function cardPays(ym) {
  const [from, to] = monthRange(ym);
  const done = new Set();
  let used = 0;
  for (const e of state.entries) {
    if (e.kind === 'card' && e.date >= from && e.date <= to) {
      done.add(e.ref);
      used += e.cents;
    }
  }
  const pending = state.cards.filter((c) =>
    !done.has(c.id) && occurrences(cardRule(c), later(from, nextFrom(c)), to).length);
  return allocate(pending, Math.max(0, cardMonthly() - used));
}

/** Bills and card payments for a month: what's in the log plus what's still to come. */
function fixedFor(ym) {
  const [from, to] = monthRange(ym);
  let sum = 0;
  for (const e of state.entries) if (e.kind && e.date >= from && e.date <= to) sum += e.cents;
  for (const b of state.bills) sum += occurrences(b, later(from, nextFrom(b)), to).length * b.cents;
  for (const cents of cardPays(ym).values()) sum += cents;
  return sum;
}

function monthMath(ym) {
  const items = inMonth(ym);
  const flex = items.filter(isFlex);
  const B = state.settings.budget || 0;
  const fixed = fixedFor(ym);
  const flexSpent = totals(flex).out;
  return { ym, B, items, flex, fixed, flexSpent, dim: daysInMonth(ym), left: B - fixed - flexSpent };
}

/** A day's limit: the month's budget, minus bills and earlier spending, split over the days left. */
function limitOn(day, m = monthMath(monthOf(day))) {
  if (!m.B) return null;
  let before = 0;
  for (const e of m.flex) if (e.date < day) before += e.cents;
  const daysLeft = m.dim - Number(day.slice(8)) + 1;
  return Math.max(0, Math.floor((m.B - m.fixed - before) / daysLeft / 100) * 100);
}

/** Adds bills and card payments whose dates have come. Card payments wait to be ticked off. */
function postDue() {
  const t = todayKey();
  let changed = false;
  for (const b of state.bills) {
    for (const d of occurrences(b, nextFrom(b), t)) {
      state.entries.push({ id: uid(), date: d, name: b.name, cents: b.cents, income: false, at: parseKey(d).getTime(), kind: 'bill', ref: b.id });
      b.last = d;
      changed = true;
    }
  }
  for (const c of state.cards) {
    for (const d of occurrences(cardRule(c), nextFrom(c), t)) {
      const cents = cardPays(monthOf(d)).get(c.id) || 0;
      if (cents > 0) {
        state.entries.push({ id: uid(), date: d, name: `${c.name} payment`, cents, income: false, at: parseKey(d).getTime(), kind: 'card', ref: c.id, due: true });
      }
      c.last = d;
      changed = true;
    }
  }
  if (changed) save();
}

/** Unpaid card payments, then what's due in the next `days` days. */
function upcoming(days) {
  const t = todayKey();
  const from = addDays(t, 1);
  const to = addDays(t, days);
  const due = state.entries.filter((e) => e.due).map((e) => ({ id: e.id, name: e.name, cents: e.cents, date: e.date, due: true }));
  const soon = [];
  for (const b of state.bills) {
    for (const d of occurrences(b, later(from, nextFrom(b)), to)) soon.push({ name: b.name, cents: b.cents, date: d });
  }
  const thisMonth = cardPays(monthOf(t));
  const typical = allocate(state.cards, cardMonthly());
  for (const c of state.cards) {
    for (const d of occurrences(cardRule(c), later(from, nextFrom(c)), to)) {
      const cents = (monthOf(d) === monthOf(t) ? thisMonth : typical).get(c.id) || 0;
      if (cents) soon.push({ name: `${c.name} payment`, cents, date: d });
    }
  }
  return [...due.sort(byDate), ...soon.sort(byDate)];
}

/* Count-up for totals, so a new entry visibly lands in the sum. */
const shown = new WeakMap();
function tween(node, value, show, animate) {
  const from = shown.get(node);
  shown.set(node, value);
  cancelAnimationFrame(node._raf);
  if (!animate || from === undefined || from === value || reduceMotion.matches) {
    node.textContent = show(value);
    return;
  }
  const whole = from % 100 === 0 && value % 100 === 0;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 420);
    let v = from + (value - from) * (1 - (1 - k) ** 3);
    v = whole ? Math.round(v / 100) * 100 : Math.round(v);
    node.textContent = show(k < 1 ? v : value);
    if (k < 1) node._raf = requestAnimationFrame(step);
  };
  node._raf = requestAnimationFrame(step);
}

/* ---------------- the day ---------------- */

function subText(out, inn, count) {
  if (!count) return view === todayKey() ? 'Nothing yet' : 'Nothing logged';
  if (!out && inn) return `${money(inn)} in`;
  return inn ? `${money(out)} spent, ${money(inn)} in` : `${money(out)} spent`;
}

function rowEl(e, isNew) {
  const li = h(`li.row${isNew ? '.new' : ''}${e.due ? '.due' : ''}`, { dataset: { id: e.id } });
  if (e.due) li.append(h('button.tick', { type: 'button', 'aria-label': `Mark ${e.name} as paid` }));
  li.append(h('span.name', e.name));
  if (e.kind) li.append(repeatIcon());
  li.append(h('span.amt', (e.income ? '+' : '') + fmtPlain(e.cents)));
  return li;
}

function renderDay(opts = {}) {
  const items = byDay(view);
  const { out, inn } = totals(items);
  const isToday = view === todayKey();
  el.title.textContent = dayTitle(view);
  el.goToday.hidden = isToday;
  if (items.length) {
    tween(el.sub, out, (v) => subText(v, inn, items.length), opts.animate);
  } else {
    shown.delete(el.sub);
    el.sub.textContent = '';
  }
  el.tip.hidden = !items.length || state.ui.tipSeen;
  el.list.replaceChildren(...items.map((e) => rowEl(e, e.id === opts.flash)));
  renderStrip();
  renderBar(opts.animate);
  renderHint();
  if (openSheetEl === el.monthSheet) renderMonth();
  if (openSheetEl === el.findSheet) renderFind();
  if (openSheetEl === el.entrySheet) renderEntry();
}

/* The card: a ring for today's limit, what's left of it, what's left this month, and the next thing due. */
function renderBar(animate) {
  const t = todayKey();
  const stats = [];
  let progress = 0;
  let over = false;
  el.ring.hidden = !state.settings.budget;
  if (!state.settings.budget) {
    shown.delete(el.cMain);
    el.cMain.textContent = 'Set a budget';
    el.cMainLabel.textContent = 'to get a daily limit';
  } else {
    const m = monthMath(monthOf(view));
    const limit = limitOn(view, m);
    const spent = totals(byDay(view).filter(isFlex)).out;
    const left = limit - spent;
    over = left < 0;
    progress = limit ? Math.min(1, spent / limit) : spent ? 1 : 0;
    const word = over ? 'over' : view === t ? 'left' : 'under';
    tween(el.cMain, Math.abs(left), (v) => `${money(v)} ${word}`, animate);
    el.cMainLabel.textContent = view === t ? `of ${money(limit, true)} today` : `of ${money(limit, true)}`;
    const now = monthOf(view) === monthOf(t) ? m : monthMath(monthOf(t));
    stats.push([money(Math.abs(now.left), true), `${now.left >= 0 ? 'left' : 'over'} in ${monthShort(now.ym)}`]);
  }
  const soon = upcoming(10);
  const due = soon.filter((u) => u.due);
  // a payment waiting to be made goes first, so it stays visible on small phones
  if (due.length) {
    const sum = due.reduce((s, u) => s + u.cents, 0);
    stats.unshift([money(sum, true), due.length === 1 ? `pay ${shortName(due[0].name)}` : `${due.length} to pay`]);
  } else if (soon.length) {
    stats.push([money(soon[0].cents, true), `${shortName(soon[0].name)} ${when(soon[0].date)}`]);
  }
  el.cStats.replaceChildren(...stats.map(([v, l]) => h('span.stat', h('b', v), h('small', l))));
  el.card.classList.toggle('alert', due.length > 0); // styles the first stat
  el.card.classList.toggle('over', over);
  el.ringArc.style.strokeDasharray = `${Math.round(progress * 100)} 100`;
  el.ringArc.style.opacity = progress > 0 ? '1' : '0';
  el.cardHint.hidden = !state.settings.budget || state.ui.cardOpens >= 2;
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
  const picks = suggest(state.entries.filter((e) => !e.kind), q, 3);
  el.chips.replaceChildren(...picks.map((s) => {
    const b = h('button.chip', { type: 'button', 'aria-label': `Add ${s.name}, ${fmtPlain(s.cents)}` },
      h('span', s.name), h('span.chip-amt', (s.income ? '+' : '') + fmtPlain(s.cents)));
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
    const over = target.bottom + 12 - (vv.offsetTop + vv.height);
    if (over > 0 && vv.height < window.innerHeight - 80) window.scrollBy({ top: over, behavior: 'smooth' });
  });
}

el.input.addEventListener('input', renderChips);
el.input.addEventListener('focus', renderChips);
el.input.addEventListener('blur', () => setTimeout(renderChips, 0));
window.visualViewport?.addEventListener('resize', revealBelowInput);

/* ---------------- editing, deleting, paying ---------------- */

/* ---------------- an entry's details (tap a line) ---------------- */

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function pillBtn(text, onclick) {
  const b = h('button.pill-btn', { type: 'button', onclick }, h('span', text));
  b.insertAdjacentHTML('beforeend', ARROW);
  return b;
}

/* The entry's text sits in a pill that hugs it, like a tag you can edit. */
let measure;
function fitTag() {
  const i = el.eText;
  const cs = getComputedStyle(i);
  measure ||= document.createElement('canvas').getContext('2d');
  measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  i.style.width = `${Math.ceil(measure.measureText(i.value || ' ').width) + 32}px`;
}

function openEntry(id) {
  if (!state.entries.some((e) => e.id === id)) return;
  entryId = id;
  el.ePop.hidden = true;
  el.eNudge.hidden = state.ui.edited;
  renderEntry();
  openSheet(el.entrySheet);
  requestAnimationFrame(fitTag);
  if (!state.ui.tipSeen) {
    state.ui.tipSeen = true;
    save();
    el.tip.hidden = true;
  }
}

function renderEntry() {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) {
    if (openSheetEl === el.entrySheet) closeSheet();
    return;
  }
  if (document.activeElement !== el.eText) {
    el.eText.value = editText(e);
    fitTag();
  }
  el.ePanel.replaceChildren(...entryPanel(e).filter((n) => n instanceof Node));
  el.eActions.replaceChildren(...entryActions(e).filter((n) => n instanceof Node));
}

function entryPanel(e) {
  const month = monthOf(e.date);
  if (e.income) {
    return [
      h('p.lead', `+${money(e.cents)}`, h('small', shortDay(e.date))),
      h('p.fine', `Money in. ${monthLabel(month)} so far: ${money(totals(inMonth(month)).inn)} in.`),
    ];
  }
  if (e.kind === 'bill') {
    const b = state.bills.find((x) => x.id === e.ref);
    return [
      h('p.lead', money(e.cents), h('small', shortDay(e.date))),
      h('p.fine', b ? `${repeatsText(b)}. Added on its own and set aside before your daily limit.` : 'Added by a bill you’ve since deleted.'),
    ];
  }
  if (e.kind === 'card') {
    const c = state.cards.find((x) => x.id === e.ref);
    return [
      h('p.lead', money(e.cents), h('small', e.due ? `due ${shortDay(e.date)}` : 'paid')),
      h('p.fine', e.due
        ? 'Worked out from your card plan: minimums first, the rest to the highest rate. Tick it off once you’ve paid.'
        : c ? `${c.name} balance is now about ${money(c.balance, true)}.` : 'Paid.'),
    ];
  }

  // everyday spending: where it sits in its day
  const spent = totals(byDay(e.date).filter(isFlex)).out;
  const rest = spent - e.cents;
  const limit = limitOn(e.date);
  let cols;
  if (limit) {
    const left = limit - spent;
    const pct = (c) => `${Math.round((c / limit) * 100)}%`;
    cols = [['c1', e.name, e.cents, pct(e.cents)], ['c2', 'Rest of day', rest, pct(rest)],
      ['c3', left >= 0 ? 'Left' : 'Over', Math.abs(left), pct(Math.abs(left))]];
  } else {
    const pct = (c) => `${spent ? Math.round((c / spent) * 100) : 0}%`;
    cols = [['c1', e.name, e.cents, pct(e.cents)], ['c2', 'Rest of day', rest, pct(rest)]];
  }
  const bar = h('div.segbar', cols.map(([c, label, cents]) => {
    if (label === 'Over' || cents <= 0) return null;
    const seg = h(`i.${c}`);
    seg.style.flexGrow = String(cents);
    return seg;
  }));
  const same = inMonth(month).filter((x) => isFlex(x) && x.name.toLocaleLowerCase() === e.name.toLocaleLowerCase());
  return [
    h('p.lead', money(e.cents), h('small', shortDay(e.date))),
    h(`div.split${cols.length === 2 ? '.two' : ''}`, cols.map(([c, label, cents, p]) =>
      h(`div.${c}`, h('b', label), h('span', h('span.v', money(cents)), p)))),
    bar,
    same.length > 1 && h('p.fine', `${plural(same.length, 'time')} in ${monthLabel(month)}, ${money(totals(same).out)} in total.`),
  ];
}

function entryActions(e) {
  const after = (fn) => () => {
    closeSheet();
    setTimeout(fn, 160);
  };
  if (e.kind === 'card') {
    const card = state.cards.find((c) => c.id === e.ref);
    return [
      e.due && h('button.primary', { type: 'button', onclick: () => markPaid(e.id) }, 'Mark as paid'),
      card && pillBtn('Edit card', after(() => openBills({ type: 'card', id: card.id }))),
    ];
  }
  if (e.kind === 'bill') {
    const bill = state.bills.find((b) => b.id === e.ref);
    return [bill && pillBtn('Edit bill', after(() => openBills({ type: 'bill', id: bill.id })))];
  }
  return [pillBtn(`See every ${e.name}`, () => openFind(e.name))];
}

el.eText.addEventListener('input', fitTag);
el.eText.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    el.eText.blur();
  }
});
el.eText.addEventListener('change', () => {
  const e = state.entries.find((x) => x.id === entryId);
  if (!e) return;
  const text = el.eText.value;
  if (!text.trim()) {
    closeSheet();
    removeEntry(e.id);
    return;
  }
  const p = parseEntry(text);
  if (p.ok) Object.assign(e, { name: p.name, cents: p.cents, income: e.kind ? false : p.income });
  else if (p.reason === 'no-amount' && p.name) e.name = p.name; // renamed without the amount: keep it
  state.ui.edited = true;
  el.eNudge.hidden = true;
  save();
  el.eText.value = editText(e);
  fitTag();
  renderDay({ animate: true });
});
el.eMore.addEventListener('click', (ev) => {
  ev.stopPropagation();
  el.ePop.hidden = !el.ePop.hidden;
});
el.eDelete.addEventListener('click', () => {
  const id = entryId;
  el.ePop.hidden = true;
  closeSheet();
  removeEntry(id);
});
el.entrySheet.addEventListener('click', (ev) => {
  if (!ev.target.closest('#ePop, #eMore')) el.ePop.hidden = true;
});

function removeEntry(id) {
  const i = state.entries.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [gone] = state.entries.splice(i, 1);
  save();
  renderDay({ animate: true });
  toast(`Deleted ${gone.name}`, 'Undo', () => {
    state.entries.push(gone);
    save();
    renderDay({ animate: true, flash: gone.id });
  });
}

/* Ticking off a card payment also lowers that card's balance (with a month's interest). */
function markPaid(id) {
  const e = state.entries.find((x) => x.id === id);
  if (!e?.due) return;
  const card = state.cards.find((c) => c.id === e.ref);
  const before = card?.balance;
  e.due = false;
  if (card) card.balance = Math.max(0, Math.round(card.balance * (1 + card.apr / 1200)) - e.cents);
  save();
  renderDay({ animate: true });
  toast(`Paid ${shortName(e.name)}`, 'Undo', () => {
    e.due = true;
    if (card) card.balance = before;
    save();
    renderDay({ animate: true });
  });
}

el.list.addEventListener('click', (ev) => {
  const li = ev.target.closest('.row');
  if (!li) return;
  if (ev.target.closest('.tick')) markPaid(li.dataset.id);
  else openEntry(li.dataset.id);
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

/* Hide the bar while the keyboard is up. */
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

/* Tap the date for a row of days; "Go to today" appears whenever you're on another day. */
function setStrip(open) {
  stripOpen = open;
  renderStrip();
}

function stripLabel(k) {
  const t = todayKey();
  if (k === t) return 'Today';
  if (k > addDays(t, -7)) return fmt({ weekday: 'short' }).format(parseKey(k));
  return shortDate(k);
}

function renderStrip() {
  el.strip.hidden = !stripOpen;
  el.title.setAttribute('aria-expanded', String(stripOpen));
  if (!stripOpen) return;
  const t = todayKey();
  const first = state.entries.reduce((m, e) => (e.date < m ? e.date : m), t);
  let start = later(first, addDays(t, -30));
  if (start > addDays(t, -6)) start = addDays(t, -6);
  if (view < start) start = view;
  const days = [];
  for (let k = start; k <= t; k = addDays(k, 1)) days.push(k);
  el.stripDays.replaceChildren(
    h('button.strip-all', {
      type: 'button',
      onclick: () => {
        setStrip(false);
        openFind('');
      },
    }, 'View all history'),
    ...days.map((k) => h(`button${k === view ? '.on' : ''}`, {
      type: 'button',
      'aria-current': k === view ? 'date' : false,
      onclick: () => goTo(k, k > view ? 1 : -1),
    }, stripLabel(k))),
  );
  requestAnimationFrame(() => {
    const on = el.stripDays.querySelector('.on');
    if (on) el.stripDays.scrollLeft = on.offsetLeft - el.stripDays.offsetLeft - (el.stripDays.clientWidth - on.offsetWidth) / 2;
  });
}

el.title.addEventListener('click', () => setStrip(!stripOpen));
el.stripDone.addEventListener('click', () => setStrip(false));
el.goToday.addEventListener('click', () => goTo(todayKey(), 1));

/* ---------------- drawer ---------------- */

const drawerOpen = () => document.body.classList.contains('drawer-open');

function openDrawer() {
  if (openSheetEl) closeSheet();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.body.classList.add('drawer-open');
  el.drawer.inert = false;
  el.drawer.setAttribute('aria-hidden', 'false');
  el.main.inert = true;
}

function closeDrawer() {
  if (!drawerOpen()) return;
  document.body.classList.remove('drawer-open');
  el.drawer.inert = true;
  el.drawer.setAttribute('aria-hidden', 'true');
  el.main.inert = false;
}

el.menuBtn.addEventListener('click', () => (drawerOpen() ? closeDrawer() : openDrawer()));
el.shade.addEventListener('click', closeDrawer);

// a swipe to the left closes it
let drawerX = null;
for (const node of [el.shade, el.drawer]) {
  node.addEventListener('touchstart', (ev) => { drawerX = ev.touches[0].clientX; }, { passive: true });
  node.addEventListener('touchmove', (ev) => {
    if (drawerX !== null && ev.touches[0].clientX - drawerX < -36) {
      drawerX = null;
      closeDrawer();
    }
  }, { passive: true });
}

el.drawer.addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-go]')?.dataset.go;
  if (!go) return;
  closeDrawer();
  const soon = (fn) => setTimeout(fn, 200);
  if (go === 'today') goTo(todayKey(), 1);
  else if (go === 'history') soon(() => openFind(''));
  else if (go === 'month') soon(() => openMonth(monthOf(view)));
  else if (go === 'bills') soon(() => openBills());
  else if (go === 'settings') soon(() => openMenu());
  else if (go === 'backup') backup();
});

let swipe = null;
el.main.addEventListener('touchstart', (ev) => {
  swipe = null;
  if (ev.touches.length !== 1 || openSheetEl || drawerOpen() || document.activeElement === el.input || ev.target.closest('.strip')) return;
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
  if (ev.key === 'Escape' && drawerOpen()) {
    closeDrawer();
    return;
  }
  const typing = document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName);
  if (typing || openSheetEl || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === 'ArrowLeft') goTo(addDays(view, -1), -1);
  else if (ev.key === 'ArrowRight' && view < todayKey()) goTo(addDays(view, 1), 1);
});

/* ---------------- sheets ---------------- */

const sheets = [el.entrySheet, el.monthSheet, el.menuSheet, el.billsSheet, el.findSheet];

function openSheet(sheet) {
  if (drawerOpen()) closeDrawer();
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
  sheet.querySelector('.sheet-body').scrollTop = 0;
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

/* ---------------- the month ---------------- */

function openMonth(ym) {
  monthView = ym;
  renderMonth();
  if (openSheetEl !== el.monthSheet) openSheet(el.monthSheet);
}

el.card.addEventListener('click', () => {
  if (!state.settings.budget) {
    openMenu(true);
    return;
  }
  if (state.ui.cardOpens < 2) {
    state.ui.cardOpens += 1;
    save();
  }
  openMonth(monthOf(view));
  renderBar();
});
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
el.mSetBudget.addEventListener('click', () => openMenu(true));
el.mBills.addEventListener('click', () => openBills());
el.mSettings.addEventListener('click', () => openMenu());

/* Short sentences worked out on the phone from your own numbers. Each is a list of text and bold parts. */
const bold = (t) => h('b', t);
function insightsFor(m) {
  const notes = [];
  const t = todayKey();
  const isNow = m.ym === monthOf(t);

  if (isNow && m.B) {
    const day = Number(t.slice(8));
    const rest = m.dim - day;
    if (m.left < 0) {
      notes.push(['You’re ', bold(money(-m.left, true)), ' over this month’s budget.']);
    } else if (day >= 3 && m.flexSpent > 0) {
      const perDay = m.flexSpent / day;
      if (perDay * rest > m.left) {
        const lasts = Math.floor(m.left / perDay);
        notes.push(['At this pace the money runs out around ', bold(shortDate(addDays(t, lasts))), `, ${plural(rest - lasts, 'day')} early.`]);
      } else {
        notes.push(['At this pace you’ll end ', monthLabel(m.ym), ' with about ', bold(money(Math.round(m.left - perDay * rest), true)), ' left.']);
      }
    }
    if (m.left > 0) {
      const usual = habits(state.entries, addDays(t, -60), t);
      const pricey = usual.filter((x) => x.avg >= 800).sort((a, b) => b.avg - a.avg)[0];
      const often = usual.find((x) => x.avg >= 300 && x !== pricey);
      const picks = [pricey, often].filter(Boolean);
      if (picks.length) {
        const parts = ['What’s left covers '];
        picks.forEach((x, i) => {
          const n = Math.floor(m.left / x.avg);
          parts.push(i ? ' or ' : '', `${x.name} `, bold(String(n)), n === 1 ? ' more time' : ' more times');
        });
        notes.push([...parts, '.']);
      }
    }
  }

  if (isNow && state.cards.some((c) => c.balance > 0)) {
    const p = payoff(state.cards, cardMonthly());
    if (p.months === Infinity) {
      notes.push('At these payments your card balances won’t shrink. Put more toward them.');
    } else {
      const extra = payoff(state.cards, p.pay + 10000);
      const sooner = p.months - extra.months;
      const more = sooner > 0 ? ` ${money(10000, true)} more a month: ${plural(sooner, 'month')} sooner.` : '';
      notes.push(['Cards paid off by ', bold(monthLabel(addMonths(monthOf(t), p.months - 1))), `, ${money(p.interest, true)} in interest.${more}`]);
    }
  }

  if (isNow) {
    const top = habits(state.entries, addDays(t, -29), t, 4)[0];
    if (top) notes.push([bold(money(Math.round((top.cents * 365) / 30), true)), ` a year on ${top.name}, at ${top.count} times a month.`]);
  } else {
    const prevYm = addMonths(m.ym, -1);
    const prev = totals(inMonth(prevYm).filter(isFlex)).out;
    if (prev > 0 && m.flexSpent > 0) {
      const d = Math.round(((m.flexSpent - prev) / prev) * 100);
      notes.push(d === 0
        ? [`Everyday spending was the same as in ${monthLabel(prevYm)}.`]
        : ['Everyday spending was ', bold(`${Math.abs(d)}% ${d > 0 ? 'higher' : 'lower'}`), ` than in ${monthLabel(prevYm)}.`]);
    }
  }
  return notes.slice(0, 4);
}

function note(text) {
  return h('li.note', text);
}

function renderMonth() {
  const ym = monthView;
  const t = todayKey();
  const isNow = ym === monthOf(t);
  const m = monthMath(ym);
  const { out, inn } = totals(m.items);

  el.mName.textContent = monthLabel(ym);
  el.mNext.disabled = !(ym < monthOf(t));
  if (m.B && isNow) {
    el.mBig.textContent = money(Math.abs(m.left));
    el.mSub.textContent = `${m.left >= 0 ? 'left of' : 'over'} your ${money(m.B, true)} budget`;
  } else {
    el.mBig.textContent = money(out);
    el.mSub.textContent = (isNow ? 'spent this month' : `spent in ${monthLabel(ym)}`) + (inn ? `, ${money(inn)} in` : '');
  }

  el.mBudget.hidden = !m.B;
  if (m.B) {
    const fixedPct = Math.min(100, (m.fixed / m.B) * 100);
    el.mFixed.style.width = `${fixedPct}%`;
    el.mFlex.style.width = `${Math.min(100 - fixedPct, (m.flexSpent / m.B) * 100)}%`;
    el.mFixedLabel.textContent = m.fixed ? `Bills and cards ${money(m.fixed, true)}` : '';
    el.mFlexLabel.textContent = `Spending ${money(m.flexSpent, true)}`;
  }
  el.mSetBudget.hidden = !!m.B || !isNow;

  const notes = insightsFor(m);
  el.mInsights.hidden = !notes.length;
  el.mInsights.replaceChildren(...notes.map((n) => h('li', n)));

  // everyday spending per day; one huge day is clipped so it doesn't flatten the rest
  const perDay = new Array(m.dim).fill(0);
  for (const e of m.flex) perDay[Number(e.date.slice(8)) - 1] += e.cents;
  const nonZero = perDay.filter(Boolean).sort((a, b) => a - b);
  let max = nonZero.length ? nonZero[nonZero.length - 1] : 1;
  if (nonZero.length >= 3) {
    const p90 = nonZero[Math.floor((nonZero.length - 1) * 0.9)];
    if (max > p90 * 2.5) max = p90 * 1.2;
  }
  el.mBars.replaceChildren(...perDay.map((cents, i) => {
    const k = `${ym}-${String(i + 1).padStart(2, '0')}`;
    const bar = h('i');
    if (cents) bar.style.height = `${Math.min(100, Math.max(4, (cents / max) * 100))}%`;
    return h(`button${k === view ? '.on' : ''}${k > t ? '.future' : ''}${cents > max ? '.clipped' : ''}`, {
      type: 'button',
      disabled: k > t,
      'aria-label': `${shortDay(k)}: ${money(cents)}`,
      onclick: () => {
        closeSheet();
        goTo(k, k > view ? 1 : -1);
      },
    }, bar);
  }));
  el.mAxisStart.textContent = '1';
  el.mAxisEnd.textContent = String(m.dim);

  const soon = isNow ? upcoming(31) : [];
  el.mSoonLabel.hidden = !soon.length;
  el.mSoon.replaceChildren(...soon.map((u) => {
    const li = h(`li.row${u.due ? '.due' : ''}`);
    if (u.due) li.append(h('button.tick', { type: 'button', 'aria-label': `Mark ${u.name} as paid`, onclick: () => markPaid(u.id) }));
    li.append(h('span.name', shortName(u.name)), h('span.count', u.due ? `due ${u.date === t ? 'today' : shortDate(u.date)}` : when(u.date)), h('span.amt', fmtPlain(u.cents)));
    return li;
  }));

  const groups = groupByName(m.flex);
  el.mTopLabel.hidden = !groups.length;
  if (!groups.length) {
    el.mTop.replaceChildren(note(`No everyday spending in ${monthLabel(ym)} yet.`));
    return;
  }
  const rows = groups.slice(0, 8).map((g) => h('li.row', { onclick: () => openFind(g.name) },
    h('span.name', g.name), h('span.count', g.count > 1 ? `${g.count}×` : ''), h('span.amt', fmtPlain(g.cents))));
  if (groups.length > 8) rows.push(note(`and ${groups.length - 8} more`));
  el.mTop.replaceChildren(...rows);
}

/* ---------------- search + past days ---------------- */

function openFind(q = '') {
  el.findInput.value = q;
  renderFind();
  openSheet(el.findSheet);
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
  return h('button.hit', {
    type: 'button',
    onclick: () => {
      closeSheet();
      goTo(day, day > view ? 1 : -1);
    },
  }, h('span.hit-main', h('span.hit-title', title), meta && h('span.hit-meta', meta)), h('span.amt', amount));
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
    ? `${plural(hits.length, 'entry', 'entries')}, ${money(out)} spent${inn ? `, ${money(inn)} in` : ''}`
    : `Nothing matches “${raw}”.`;
  el.findList.replaceChildren(...hits.slice(0, 400).map((e) =>
    hitRow(e.name, shortDay(e.date), (e.income ? '+' : '') + fmtPlain(e.cents), e.date)));
}

function renderHistory() {
  const days = new Map();
  for (const e of state.entries) {
    if (e.due) continue;
    const d = days.get(e.date) ?? { out: 0, inn: 0 };
    if (e.income) d.inn += e.cents;
    else d.out += e.cents;
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
      nodes.push(h('div.month-head', h('span', monthLabel(ym)), h('span', money(monthOut.get(ym), true))));
    }
    const d = days.get(k);
    nodes.push(hitRow(shortDay(k), d.inn && d.out ? `${money(d.inn)} in` : '', d.out || !d.inn ? money(d.out) : `+${money(d.inn)}`, k));
  }
  el.findList.replaceChildren(...nodes);
}

/* ---------------- menu: budget, currency, data ---------------- */

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
  const n = state.bills.length + state.cards.length;
  el.billsCount.textContent = n ? String(n) : 'None yet';
}

function openMenu(focusBudget = false) {
  syncSettings();
  openSheet(el.menuSheet);
  if (focusBudget) el.budget.focus();
}


/** '2,400' / '$2400' → cents, or null when empty or not a number. */
function readCents(text) {
  const raw = String(text).replace(/[^\d.,]/g, '');
  const n = raw ? toNumber(raw) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

el.budget.addEventListener('focus', () => {
  const b = state.settings.budget;
  el.budget.value = b ? String(b / 100) : '';
});
el.budget.addEventListener('blur', () => {
  const cents = readCents(el.budget.value);
  state.settings.budget = cents > 0 ? cents : null;
  save();
  syncSettings();
  renderDay();
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

el.billsBtn.addEventListener('click', () => openBills());

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

function backup() {
  const data = { app: 'spent', ...state, saved: new Date().toISOString() };
  shareFile(`spent-backup-${todayKey()}.json`, 'application/json', JSON.stringify(data));
}
el.backupBtn.addEventListener('click', backup);

el.restoreBtn.addEventListener('click', () => el.restoreFile.click());

el.restoreFile.addEventListener('change', async () => {
  const file = el.restoreFile.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data?.entries;
    if (!Array.isArray(incoming)) throw new Error('not a backup');
    const merge = (target, items, clean) => {
      const have = new Set(target.map((x) => x.id));
      let added = 0;
      for (const raw of items) {
        const x = clean(raw);
        if (x && !have.has(x.id)) {
          target.push(x);
          have.add(x.id);
          added += 1;
        }
      }
      return added;
    };
    const added = merge(state.entries, incoming, sanitizeEntry);
    merge(state.bills, arr(data.bills), sanitizeBill);
    merge(state.cards, arr(data.cards), sanitizeCard);
    const st = data?.settings;
    if (st && typeof st === 'object') {
      if (typeof st.currency === 'string' && st.currency) state.settings.currency = st.currency;
      if (posInt(st.budget)) state.settings.budget = st.budget;
      if (posInt(st.cardMonthly)) state.settings.cardMonthly = st.cardMonthly;
    }
    save();
    fillCurrencies();
    syncSettings();
    renderDay();
    toast(added ? `Restored ${plural(added, 'entry', 'entries')}` : 'That backup has nothing new');
  } catch {
    toast('That file isn’t a Spent backup');
  } finally {
    el.restoreFile.value = '';
  }
});

el.eraseBtn.addEventListener('click', () => {
  // eslint-disable-next-line no-alert
  if (!window.confirm('Erase all entries, bills, cards and settings? This can’t be undone. Save a backup first if you might want them back.')) return;
  state = blank();
  save();
  closeSheet();
  fillCurrencies();
  syncSettings();
  renderDay();
  toast('Everything erased');
});

/* ---------------- bills and cards ---------------- */

let billsForm = null; // null: the list; { type: 'bill' | 'card', id? }: a form

function openBills(form = null) {
  billsForm = form;
  renderBills();
  openSheet(el.billsSheet);
}

function showBills(form) {
  billsForm = form;
  renderBills();
  el.billsBody.scrollTop = 0;
}

function renderBills() {
  const nodes = billsForm?.type === 'bill' ? billForm(billsForm.id)
    : billsForm?.type === 'card' ? cardForm(billsForm.id)
      : billsList();
  el.billsBody.replaceChildren(...nodes.filter((n) => n instanceof Node));
}

function repeatsText(b) {
  if (b.every === 'week') return `Every ${fmt({ weekday: 'long' }).format(parseKey(b.start))}`;
  if (b.every === 'year') return `Every year on ${shortDate(b.start)}`;
  return `Every month on the ${ordinal(Number(b.start.slice(8)))}`;
}

const nextDate = (item, every = 'month') => occurrences({ start: item.start, every }, nextFrom(item), '9999-12-31')[0] ?? item.start;

function cardPlanText() {
  const pays = allocate(state.cards, cardMonthly());
  const parts = state.cards.filter((c) => pays.get(c.id)).map((c) => `${c.name} ${money(pays.get(c.id), true)}`);
  if (!parts.length) return 'All paid off.';
  const auto = state.settings.cardMonthly == null;
  const how = !auto ? '' : cardRoom() == null
    ? ' Auto pays the minimums until it has a month of your spending to learn from.'
    : ' Auto is what your budget leaves after bills and usual spending.';
  return `Plan: ${parts.join(', ')} a month. Extra goes to the highest rate first, which costs the least interest.${how}`;
}

function billsList() {
  const billRows = state.bills.map((b) => h('button.item.two', { type: 'button', onclick: () => showBills({ type: 'bill', id: b.id }) },
    h('span.item-main', h('span', b.name), h('small', repeatsText(b))), h('span.amt', fmtPlain(b.cents))));
  const cardRows = state.cards.map((c) => h('button.item.two', { type: 'button', onclick: () => showBills({ type: 'card', id: c.id }) },
    h('span.item-main', h('span', c.name), h('small', c.balance > 0 ? `${c.apr}%, due on the ${ordinal(Number(c.start.slice(8)))}` : 'Paid off')),
    h('span.amt', c.balance > 0 ? fmtPlain(c.balance) : '')));

  const monthly = h('input', { type: 'text', inputmode: 'decimal', enterkeyhint: 'done', autocomplete: 'off', 'aria-label': 'Toward cards per month' });
  const showMonthly = () => {
    const v = state.settings.cardMonthly;
    monthly.value = v ? money(v, true) : '';
    monthly.placeholder = `Auto, ${money(cardMonthly(), true)}`;
  };
  showMonthly();
  monthly.addEventListener('focus', () => {
    monthly.value = state.settings.cardMonthly ? String(state.settings.cardMonthly / 100) : '';
  });
  monthly.addEventListener('blur', () => {
    const cents = readCents(monthly.value);
    state.settings.cardMonthly = cents > 0 ? cents : null;
    save();
    renderBills();
    renderDay();
  });
  monthly.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      monthly.blur();
    }
  });

  return [
    h('div.sheet-top', h('h2', 'Bills and cards')),
    h('p.sub', 'Added to your days on their dates. Card payments wait for you to tick them off.'),
    h('h3.label', 'Bills'),
    h('div.group', billRows, h('button.item.add', { type: 'button', onclick: () => showBills({ type: 'bill' }) }, 'Add a bill')),
    h('h3.label', 'Cards'),
    h('div.group', cardRows, h('button.item.add', { type: 'button', onclick: () => showBills({ type: 'card' }) }, 'Add a card')),
    state.cards.length && h('div.group', h('label.item', h('span', 'Per month'), monthly)),
    state.cards.length && h('p.fine', cardPlanText()),
  ];
}

function field(label, input) {
  return h('label.item', h('span', label), input);
}

function textInput(attrs, value) {
  const i = h('input', { type: 'text', autocomplete: 'off', ...attrs });
  i.value = value ?? '';
  return i;
}

function dateInput(value) {
  const t = todayKey();
  const i = h('input', { type: 'date', min: `${addMonths(monthOf(t), -1)}-01`, max: addDays(t, 400) });
  i.value = value;
  return i;
}

const firstOfNextMonth = () => `${addMonths(monthOf(todayKey()), 1)}-01`;

function formTop(title) {
  return h('div.sheet-top', h('h2', title), h('button.link', { type: 'button', onclick: () => showBills(null) }, 'Cancel'));
}

function afterChange() {
  save();
  postDue();
  showBills(null);
  renderDay({ animate: true });
}

function billForm(id) {
  const b = state.bills.find((x) => x.id === id);
  const name = textInput({ placeholder: 'Rent', autocapitalize: 'words', enterkeyhint: 'next' }, b?.name);
  const amount = textInput({ inputmode: 'decimal', placeholder: '0', enterkeyhint: 'next' }, b ? String(b.cents / 100) : '');
  const shownDate = b ? nextDate(b, b.every) : firstOfNextMonth();
  const date = dateInput(shownDate);
  const every = h('select.overlay', { 'aria-label': 'Repeats' },
    [['month', 'Every month'], ['week', 'Every week'], ['year', 'Every year']].map(([v, l]) => new Option(l, v, false, (b?.every ?? 'month') === v)));
  const everyValue = h('span.value', every.selectedOptions[0]?.text ?? 'Every month');
  every.addEventListener('change', () => { everyValue.textContent = every.selectedOptions[0].text; });

  const submit = () => {
    const n = name.value.trim();
    const cents = readCents(amount.value);
    if (!n || !(cents > 0) || !date.value) {
      toast('Add a name, an amount and a date');
      return;
    }
    if (b) {
      const moved = date.value !== shownDate || every.value !== b.every;
      Object.assign(b, { name: n, cents, every: every.value });
      if (moved) Object.assign(b, { start: date.value, last: null });
    } else {
      state.bills.push({ id: uid(), name: n, cents, start: date.value, every: every.value, last: null });
    }
    afterChange();
  };
  const remove = () => {
    state.bills = state.bills.filter((x) => x !== b);
    afterChange();
  };

  return [
    formTop(b ? b.name : 'New bill'),
    h('div.group', field('Name', name), field('Amount', amount), field(b ? 'Next date' : 'Date', date),
      h('label.item', h('span', 'Repeats'), everyValue, every)),
    !b && h('p.fine', 'Already taken out this month? Pick that date and it counts toward this month too.'),
    h('button.primary', { type: 'button', onclick: submit }, b ? 'Save' : 'Add bill'),
    b && h('div.group', h('button.item.danger', { type: 'button', onclick: remove }, 'Delete bill')),
  ];
}

function cardForm(id) {
  const c = state.cards.find((x) => x.id === id);
  const name = textInput({ placeholder: 'Amex', autocapitalize: 'words', enterkeyhint: 'next' }, c?.name);
  const balance = textInput({ inputmode: 'decimal', placeholder: '0', enterkeyhint: 'next' }, c ? String(c.balance / 100) : '');
  const apr = textInput({ inputmode: 'decimal', placeholder: '24.9%', enterkeyhint: 'next' }, c ? `${c.apr}%` : '');
  const min = textInput({ inputmode: 'decimal', placeholder: 'Optional', enterkeyhint: 'done' }, c?.min ? String(c.min / 100) : '');
  const shownDate = c ? nextDate(c) : firstOfNextMonth();
  const date = dateInput(shownDate);

  const submit = () => {
    const n = name.value.trim();
    const bal = readCents(balance.value);
    const rate = toNumber(apr.value.replace(/[^\d.,]/g, '') || '0');
    const minimum = readCents(min.value) ?? 0;
    if (!n || bal == null || !date.value || !Number.isFinite(rate) || rate >= 100) {
      toast('Add a name, what you owe, the interest rate and a due date');
      return;
    }
    if (c) {
      const moved = date.value !== shownDate;
      Object.assign(c, { name: n, balance: bal, apr: rate, min: minimum });
      if (moved) Object.assign(c, { start: date.value, last: null });
    } else {
      state.cards.push({ id: uid(), name: n, balance: bal, apr: rate, min: minimum, start: date.value, last: null });
    }
    afterChange();
  };
  const remove = () => {
    state.cards = state.cards.filter((x) => x !== c);
    state.entries = state.entries.filter((e) => !(e.due && e.ref === c.id));
    afterChange();
  };

  return [
    formTop(c ? c.name : 'New card'),
    h('div.group', field('Name', name), field('Balance owed', balance), field('Interest rate (APR)', apr),
      field('Minimum payment', min), field(c ? 'Next due date' : 'Due date', date)),
    h('p.fine', 'For balances you’re paying down. A card you clear in full each month doesn’t need adding: what you log already counts.'),
    h('button.primary', { type: 'button', onclick: submit }, c ? 'Save' : 'Add card'),
    c && h('div.group', h('button.item.danger', { type: 'button', onclick: remove }, 'Delete card')),
  ];
}

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

/* ---------------- new day, coming back, start up ---------------- */

let hiddenAt = 0;
function refresh() {
  postDue();
  const t = todayKey();
  if (followToday && view !== t) view = t;
  renderDay();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  // back after a while: start from today again
  if (hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000) followToday = true;
  refresh();
});
window.addEventListener('pageshow', (ev) => {
  if (ev.persisted) refresh();
});
setInterval(() => {
  if (followToday && view !== todayKey() && document.activeElement !== el.input) refresh();
}, 60_000);

postDue();
fillCurrencies();
syncSettings();
renderDay();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // when an update takes over, reload into it, unless you're in the middle of typing
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const busy = el.input.value.trim() || openSheetEl || drawerOpen();
    if (hadController && !reloading && !busy) {
      reloading = true;
      location.reload();
    }
  });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
