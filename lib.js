// Pure helpers shared by the app and its tests. No DOM in here.

/* ---------- dates (local calendar days as 'YYYY-MM-DD') ---------- */

export const pad2 = (n) => String(n).padStart(2, '0');

export const keyOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export const monthOf = (k) => k.slice(0, 7);

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const monthRange = (ym) => [`${ym}-01`, `${ym}-${pad2(daysInMonth(ym))}`];

/** Monday–Sunday week that contains day k, as [start, end]. */
export function weekRange(k) {
  const d = parseKey(k);
  const back = (d.getDay() + 6) % 7;
  const start = keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - back));
  return [start, addDays(start, 6)];
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- reading what people type ---------- */

/**
 * '1,200.50' → 1200.5, '5,50' → 5.5, '1.200' → 1200, '.5' → 0.5. NaN when unclear.
 * A single separator followed by exactly three digits is read as a thousands separator.
 */
export function toNumber(s) {
  const dot = s.lastIndexOf('.');
  const comma = s.lastIndexOf(',');
  if (dot === -1 && comma === -1) return /^\d+$/.test(s) ? Number(s) : NaN;
  if (dot !== -1 && comma !== -1) {
    const at = Math.max(dot, comma);
    const int = s.slice(0, at).replace(/[.,]/g, '');
    const frac = s.slice(at + 1);
    if (!/^\d*$/.test(int) || !/^\d{0,2}$/.test(frac)) return NaN;
    return Number(`${int || 0}.${frac || 0}`);
  }
  const parts = s.split(dot !== -1 ? '.' : ',');
  if (parts.some((p) => !/^\d*$/.test(p))) return NaN;
  const [first, ...rest] = parts;
  const grouped = first.length >= 1 && first.length <= 3 && first !== '0' && rest.every((p) => p.length === 3);
  if (grouped) return Number(parts.join(''));
  if (parts.length === 2 && rest[0].length <= 2) return Number(`${first || 0}.${rest[0] || 0}`);
  return NaN;
}

const SYMBOL = '[$€£₹¥₩₽₺₦₱฿₫¢]';
const CODE = '(?:usd|eur|gbp|inr|aed|cad|aud|sgd|jpy|chf|rs\\.?|dhs?)';
const AMOUNT_RE = new RegExp(
  `^([+-]?)(?:${SYMBOL}|${CODE}(?=[\\d.,+-]))?([+-]?)(\\d[\\d.,]*|[.,]\\d+)(k)?(?:${SYMBOL}|${CODE})?$`,
  'i',
);

function readAmount(token) {
  const m = AMOUNT_RE.exec(token);
  if (!m || (m[1] && m[2])) return null;
  let value = toNumber(m[3]);
  if (!Number.isFinite(value)) return null;
  if (m[4]) value *= 1000;
  return { value, income: (m[1] || m[2]) === '+' };
}

// "5 on coffee" → "coffee", "lunch for 14" → "lunch"
const LEAD = /^(?:(?:on|for|at)\s+|[@:–—-]\s*)/i;
const TRAIL = /(?:\s+(?:on|for|at)|\s*[@:–—-])$/i;

export const capitalize = (s) => (s ? s[0].toLocaleUpperCase() + s.slice(1) : s);

/**
 * 'coffee 5.50' → { ok, name: 'Coffee', cents: 550, income: false }
 * '+2400 invoice' → income. The amount is the last number, else the first.
 */
export function parseEntry(input) {
  const text = String(input ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return { ok: false, reason: 'empty' };
  const tokens = text.split(' ');
  const last = tokens.length - 1;
  const hits = [];
  tokens.forEach((t, i) => {
    const a = readAmount(t);
    if (a) hits.push({ i, ...a });
  });
  if (!hits.length) return { ok: false, reason: 'no-amount', name: capitalize(text).slice(0, 140) };
  const pick = hits.find((h) => h.i === last) ?? hits.find((h) => h.i === 0) ?? hits[hits.length - 1];
  let name = tokens.filter((_, i) => i !== pick.i).join(' ');
  if (pick.i === 0) name = name.replace(LEAD, '');
  if (pick.i === last) name = name.replace(TRAIL, '');
  name = capitalize(name.trim()).slice(0, 140);
  const cents = Math.round(pick.value * 100);
  if (cents <= 0) return { ok: false, reason: 'zero', name };
  if (cents > 99_999_999_999) return { ok: false, reason: 'too-big', name };
  return { ok: true, name: name || (pick.income ? 'Income' : 'Expense'), cents, income: pick.income };
}

/** Text shown when a line is tapped for editing; parses back to the same entry. */
export const editText = (e) =>
  `${e.name} ${e.income ? '+' : ''}${(e.cents / 100).toFixed(e.cents % 100 ? 2 : 0)}`;

/* ---------- formatting ---------- */

const formatters = new Map();
const nf = (key, make) => {
  if (!formatters.has(key)) formatters.set(key, make());
  return formatters.get(key);
};

/** 550 → '5.50', 1800 → '18', 240000 → '2,400' */
export function fmtPlain(cents) {
  const d = cents % 100 === 0 ? 0 : 2;
  return nf(`p${d}`, () => new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }))
    .format(cents / 100);
}

/** 8450 → '$84.50'; with round: '$85' */
export function fmtMoney(cents, currency = 'USD', { round = false } = {}) {
  const d = round || cents % 100 === 0 ? 0 : 2;
  const value = (d ? cents / 100 : Math.round(cents / 100)) || 0;
  const opts = { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d };
  try {
    return nf(`m${currency}${d}`, () => new Intl.NumberFormat(undefined, { ...opts, currencyDisplay: 'narrowSymbol' }))
      .format(value);
  } catch {
    try {
      return nf(`s${currency}${d}`, () => new Intl.NumberFormat(undefined, opts)).format(value);
    } catch {
      return `${fmtPlain(Math.round(value * 100))} ${currency}`;
    }
  }
}

/* ---------- sums and summaries ---------- */

/** Everyday spending: not income, not a bill or card payment. */
export const isFlex = (e) => !e.kind && !e.income;

/** Money out and in. Card payments still waiting to be made don't count yet. */
export function totals(list) {
  let out = 0;
  let inn = 0;
  for (const e of list) {
    if (e.due) continue;
    if (e.income) inn += e.cents;
    else out += e.cents;
  }
  return { out, inn };
}

/** Spending grouped by name (case-insensitive), biggest first. */
export function groupByName(list) {
  const groups = new Map();
  for (const e of list) {
    if (e.income) continue;
    const key = e.name.trim().toLocaleLowerCase();
    const g = groups.get(key) ?? { name: e.name, count: 0, cents: 0, at: 0 };
    g.count += 1;
    g.cents += e.cents;
    if (e.at >= g.at) Object.assign(g, { at: e.at, name: e.name });
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents || b.count - a.count);
}

/**
 * Quick picks for the entry field. With no query: things logged at least twice in
 * the last 45 days. With a query: names that start with it (or have a word that does).
 */
export function suggest(entries, query = '', limit = 3, now = Date.now()) {
  const q = query.trim().toLocaleLowerCase();
  const byName = new Map();
  for (const e of entries) {
    const key = e.name.toLocaleLowerCase();
    const g = byName.get(key);
    if (!g) byName.set(key, { name: e.name, cents: e.cents, income: e.income, count: 1, at: e.at });
    else {
      g.count += 1;
      if (e.at > g.at) Object.assign(g, { at: e.at, cents: e.cents, income: e.income, name: e.name });
    }
  }
  let list = [...byName.values()];
  if (q) {
    const starts = (g) => g.name.toLocaleLowerCase().startsWith(q);
    list = list.filter((g) => starts(g) || g.name.toLocaleLowerCase().split(/\s+/).some((w) => w.startsWith(q)));
    list.sort((a, b) => starts(b) - starts(a) || b.count - a.count || b.at - a.at);
  } else {
    const since = now - 45 * 864e5;
    list = list.filter((g) => g.count >= 2 && g.at >= since);
    list.sort((a, b) => b.count - a.count || b.at - a.at);
  }
  return list.slice(0, limit);
}

/** Everyday things bought at least `minCount` times between two days, most frequent first. */
export function habits(entries, from, to, minCount = 3) {
  return groupByName(entries.filter((e) => isFlex(e) && e.date >= from && e.date <= to))
    .filter((g) => g.count >= minCount)
    .map((g) => ({ ...g, avg: Math.round(g.cents / g.count) }))
    .sort((a, b) => b.count - a.count || b.cents - a.cents);
}

/* ---------- repeating bills ---------- */

/** n-th date of { start, every: 'week' | 'month' | 'year' }. The 31st falls back to the month's last day. */
export function nth(rule, n) {
  if (rule.every === 'week') return addDays(rule.start, 7 * n);
  const s = parseKey(rule.start);
  const total = s.getMonth() + (rule.every === 'year' ? 12 * n : n);
  const y = s.getFullYear() + Math.floor(total / 12);
  const m = ((total % 12) + 12) % 12;
  const last = new Date(y, m + 1, 0).getDate();
  return keyOf(new Date(y, m, Math.min(s.getDate(), last)));
}

/** Dates a rule lands on between `from` and `to`, both included. */
export function occurrences(rule, from, to) {
  const out = [];
  if (!rule?.start || from > to) return out;
  for (let n = 0; n < 5000; n += 1) {
    const d = nth(rule, n);
    if (d > to) break;
    if (d >= from) out.push(d);
  }
  return out;
}

export const monthlyCost = (b) =>
  b.every === 'week' ? Math.round((b.cents * 52) / 12) : b.every === 'year' ? Math.round(b.cents / 12) : b.cents;

/* ---------- credit cards ---------- */

/** The card's minimum, or a typical one (1% of the balance plus a month's interest, at least 25). */
export function minPayment(card) {
  if (!(card.balance > 0)) return 0;
  const typical = Math.max(2500, Math.round(card.balance * 0.01 + (card.balance * card.apr) / 1200));
  return Math.min(card.balance, card.min > 0 ? card.min : typical);
}

/**
 * Splits a monthly amount across cards: every minimum first, then everything left
 * to the highest interest rate (the avalanche method, which costs the least interest).
 */
export function allocate(cards, amount) {
  const pays = new Map();
  let left = amount;
  for (const c of cards) {
    const p = minPayment(c);
    if (p > 0) {
      pays.set(c.id, p);
      left -= p;
    }
  }
  const byRate = cards.filter((c) => c.balance > 0).sort((a, b) => b.apr - a.apr || a.balance - b.balance);
  for (const c of byRate) {
    if (left <= 0) break;
    const p = Math.min(c.balance - (pays.get(c.id) || 0), left);
    if (p > 0) {
      pays.set(c.id, (pays.get(c.id) || 0) + p);
      left -= p;
    }
  }
  return pays;
}

/** How many months until every card is paid off at `monthly` a month, and the interest on the way. */
export function payoff(cards, monthly, limit = 600) {
  const bal = cards.filter((c) => c.balance > 0).map((c) => ({ ...c }));
  const minimums = bal.reduce((s, c) => s + minPayment(c), 0);
  const pay = Math.max(monthly || 0, minimums);
  let interest = 0;
  let months = 0;
  while (bal.some((c) => c.balance > 0)) {
    if (months >= limit) return { months: Infinity, interest, pay, minimums };
    const pays = allocate(bal, pay);
    for (const c of bal) {
      c.balance -= pays.get(c.id) || 0;
      if (c.balance > 0) {
        const i = Math.round((c.balance * c.apr) / 1200);
        c.balance += i;
        interest += i;
      }
    }
    months += 1;
  }
  return { months, interest, pay, minimums };
}

/* ---------- import / export ---------- */

const entryType = (e) => {
  if (e.income) return 'income';
  if (e.kind === 'bill') return 'bill';
  if (e.kind === 'card') return e.due ? 'card payment (not paid yet)' : 'card payment';
  return 'expense';
};

export function toCSV(entries) {
  const cell = (s) => {
    let v = String(s);
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`; // keep spreadsheets from reading it as a formula
    return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const rows = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at)
    .map((e) => [e.date, cell(e.name), (e.cents / 100).toFixed(2), entryType(e)].join(','));
  return `${['date,name,amount,type', ...rows].join('\n')}\n`;
}

/** Validates one stored or restored entry; returns a clean copy or null. */
export function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const date = String(raw.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const cents = Number.isInteger(raw.cents) ? raw.cents : Math.round(Number(raw.amount) * 100);
  if (!(cents > 0) || cents > 99_999_999_999) return null;
  const income = raw.income === true || raw.type === 'income';
  const name = String(raw.name ?? '').trim().slice(0, 140) || (income ? 'Income' : 'Expense');
  const e = {
    id: cleanId(raw.id),
    date,
    name,
    cents,
    income,
    at: Number.isFinite(raw.at) ? raw.at : parseKey(date).getTime(),
  };
  if (!income && (raw.kind === 'bill' || raw.kind === 'card')) {
    e.kind = raw.kind;
    e.ref = String(raw.ref ?? '').slice(0, 40);
    if (raw.kind === 'card' && raw.due === true) e.due = true;
  }
  return e;
}

const cleanId = (id) => (typeof id === 'string' && id ? id.slice(0, 40) : uid());
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** { id, name, cents, start, every, last } — `last` is the latest date already added to the log. */
export function sanitizeBill(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim().slice(0, 60);
  if (!name || !Number.isInteger(raw.cents) || raw.cents <= 0 || !isDay(raw.start)) return null;
  return {
    id: cleanId(raw.id),
    name,
    cents: raw.cents,
    start: raw.start,
    every: ['week', 'month', 'year'].includes(raw.every) ? raw.every : 'month',
    last: isDay(raw.last) ? raw.last : null,
  };
}

/** { id, name, balance, apr, min, start, last } — due every month on the start date's day. */
export function sanitizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? '').trim().slice(0, 60);
  const apr = Number(raw.apr);
  if (!name || !Number.isInteger(raw.balance) || raw.balance < 0 || !isDay(raw.start)) return null;
  return {
    id: cleanId(raw.id),
    name,
    balance: raw.balance,
    apr: Number.isFinite(apr) && apr >= 0 && apr < 100 ? apr : 0,
    min: Number.isInteger(raw.min) && raw.min > 0 ? raw.min : 0,
    start: raw.start,
    last: isDay(raw.last) ? raw.last : null,
  };
}
