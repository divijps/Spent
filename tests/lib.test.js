// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEntry, toNumber, editText, fmtPlain, fmtMoney, weekRange, addDays, addMonths,
  daysInMonth, totals, groupByName, suggest, toCSV, sanitizeEntry, sanitizeBill, sanitizeCard,
  nth, occurrences, monthlyCost, minPayment, allocate, payoff, habits, isFlex,
} from '../lib.js';

const ok = (text, name, cents, income = false) => {
  const p = parseEntry(text);
  assert.equal(p.ok, true, `${text} should parse`);
  assert.deepEqual({ name: p.name, cents: p.cents, income: p.income }, { name, cents, income }, text);
};

test('reads name and amount in either order', () => {
  ok('coffee 5.50', 'Coffee', 550);
  ok('5.50 coffee', 'Coffee', 550);
  ok('Garlic lemon chicken with rice 18', 'Garlic lemon chicken with rice', 1800);
  ok('uber   18.9', 'Uber', 1890);
  ok('7 eleven snacks 4.50', '7 eleven snacks', 450);
  ok('Route 66 diner 31', 'Route 66 diner', 3100);
  ok('1st birthday gift 30', '1st birthday gift', 3000);
});

test('currency symbols, separators and k', () => {
  ok('coffee $5', 'Coffee', 500);
  ok('$5 coffee', 'Coffee', 500);
  ok('chai ₹40', 'Chai', 4000);
  ok('rent 2,400', 'Rent', 240000);
  ok('rent 2,400.50', 'Rent', 240050);
  ok('croissant 3,80', 'Croissant', 380);
  ok('flight 1.200,50', 'Flight', 120050);
  ok('tip .5', 'Tip', 50);
  ok('laptop 1.2k', 'Laptop', 120000);
  ok('car 12k', 'Car', 1200000);
});

test('+ means money in', () => {
  ok('+2400 invoice', 'Invoice', 240000, true);
  ok('MRS invoice +2.4k', 'MRS invoice', 240000, true);
  ok('refund +$12.99', 'Refund', 1299, true);
  ok('+50', 'Income', 5000, true);
  ok('-5 coffee', 'Coffee', 500, false);
});

test('connector words are trimmed only next to the amount', () => {
  ok('5 on coffee', 'Coffee', 500);
  ok('lunch for 14', 'Lunch', 1400);
  ok('On Running shoes 150', 'On Running shoes', 15000);
  ok('onion rings 6', 'Onion rings', 600);
  ok('parking - 8', 'Parking', 800);
});

test('rejects entries without a usable amount', () => {
  assert.equal(parseEntry('').reason, 'empty');
  assert.equal(parseEntry('coffee').reason, 'no-amount');
  assert.equal(parseEntry('coffee 0').reason, 'zero');
  assert.equal(parseEntry('time 7:30').reason, 'no-amount');
  assert.equal(parseEntry('10% tip').reason, 'no-amount');
});

test('toNumber edge cases', () => {
  assert.equal(toNumber('1,000,000'), 1000000);
  assert.equal(toNumber('1234,56'), 1234.56);
  assert.ok(Number.isNaN(toNumber('1234.567')));
  assert.equal(toNumber('5.'), 5);
});

test('edit text round-trips', () => {
  for (const e of [
    { name: 'Coffee', cents: 550, income: false },
    { name: 'Invoice', cents: 240000, income: true },
    { name: 'Route 66 diner', cents: 3100, income: false },
  ]) {
    const p = parseEntry(editText(e));
    assert.deepEqual({ name: p.name, cents: p.cents, income: p.income }, e);
  }
});

test('formatting', () => {
  assert.equal(fmtPlain(550), '5.50');
  assert.equal(fmtPlain(1800), '18');
  assert.equal(fmtPlain(240000), '2,400');
  assert.equal(fmtMoney(8450, 'USD'), '$84.50');
  assert.equal(fmtMoney(8450, 'USD', { round: true }), '$85');
  assert.equal(fmtMoney(-12000, 'USD', { round: true }), '-$120');
  assert.equal(fmtMoney(40, 'USD', { round: true }), '$0');
  assert.match(fmtMoney(4000, 'INR'), /₹\s?40/);
});

test('calendar helpers', () => {
  assert.deepEqual(weekRange('2026-11-08'), ['2026-11-02', '2026-11-08']); // Sunday
  assert.deepEqual(weekRange('2026-11-09'), ['2026-11-09', '2026-11-15']); // Monday
  assert.deepEqual(weekRange('2026-01-01'), ['2025-12-29', '2026-01-04']);
  assert.equal(addDays('2026-03-08', 1), '2026-03-09'); // US DST start
  assert.equal(addDays('2026-11-01', 1), '2026-11-02'); // US DST end
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(daysInMonth('2028-02'), 29);
});

const sample = [
  { id: 'a', date: '2026-11-08', name: 'Coffee', cents: 550, income: false, at: 1 },
  { id: 'b', date: '2026-11-07', name: 'coffee', cents: 500, income: false, at: 2 },
  { id: 'c', date: '2026-11-07', name: 'Groceries', cents: 4210, income: false, at: 3 },
  { id: 'd', date: '2026-11-06', name: 'Invoice', cents: 240000, income: true, at: 4 },
];

test('totals and grouping', () => {
  assert.deepEqual(totals(sample), { out: 5260, inn: 240000 });
  const g = groupByName(sample);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].name, g[0].count, g[0].cents], ['Groceries', 1, 4210]);
  assert.deepEqual([g[1].count, g[1].cents], [2, 1050]);
});

test('suggestions', () => {
  const now = 10 * 864e5;
  assert.deepEqual(suggest(sample, '', 3, now).map((s) => s.name), ['coffee']);
  assert.deepEqual(suggest(sample, 'gro', 3, now).map((s) => s.name), ['Groceries']);
  assert.equal(suggest(sample, 'xyz', 3, now).length, 0);
});

test('csv escapes names and blocks formulas', () => {
  const csv = toCSV([
    { date: '2026-11-08', name: 'Dinner, drinks', cents: 4500, income: false, at: 1 },
    { date: '2026-11-08', name: '=HYPERLINK("x")', cents: 100, income: false, at: 2 },
  ]);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'date,name,amount,type');
  assert.equal(lines[1], '2026-11-08,"Dinner, drinks",45.00,expense');
  assert.equal(lines[2], `2026-11-08,"'=HYPERLINK(""x"")",1.00,expense`);
});

test('sanitizing restored entries', () => {
  assert.equal(sanitizeEntry({ date: 'nope', cents: 5 }), null);
  assert.equal(sanitizeEntry({ date: '2026-11-08', cents: -5 }), null);
  const e = sanitizeEntry({ date: '2026-11-08', name: ' Tea ', amount: 3.2, type: 'income' });
  assert.equal(e.name, 'Tea');
  assert.equal(e.cents, 320);
  assert.equal(e.income, true);
  assert.ok(e.id);
});

test('repeating dates', () => {
  const rent = { start: '2026-01-31', every: 'month' };
  assert.deepEqual([0, 1, 2, 3].map((n) => nth(rent, n)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.equal(nth({ start: '2028-02-29', every: 'year' }, 1), '2029-02-28');
  assert.deepEqual(occurrences({ start: '2026-11-03', every: 'week' }, '2026-11-08', '2026-11-30'),
    ['2026-11-10', '2026-11-17', '2026-11-24']);
  assert.deepEqual(occurrences({ start: '2026-11-01', every: 'month' }, '2026-11-02', '2027-01-15'),
    ['2026-12-01', '2027-01-01']);
  assert.deepEqual(occurrences({ start: '2026-12-01', every: 'month' }, '2026-11-01', '2026-11-30'), []);
  assert.equal(monthlyCost({ cents: 1200, every: 'year' }), 100);
  assert.equal(monthlyCost({ cents: 1000, every: 'week' }), 4333);
});

const cards = [
  { id: 'amex', balance: 320000, apr: 24.9, min: 0 },
  { id: 'chase', balance: 110000, apr: 19.9, min: 3500 },
];

test('minimum payments', () => {
  assert.equal(minPayment(cards[0]), 3200 + 6640); // 1% + a month of interest
  assert.equal(minPayment(cards[1]), 3500);
  assert.equal(minPayment({ balance: 1000, apr: 20, min: 0 }), 1000); // never more than owed
  assert.equal(minPayment({ balance: 0, apr: 20, min: 2500 }), 0);
});

test('avalanche: minimums first, the rest to the highest rate', () => {
  const pays = allocate(cards, 60000);
  assert.equal(pays.get('chase'), 3500);
  assert.equal(pays.get('amex'), 60000 - 3500);
  const tiny = allocate(cards, 1000); // below the minimums: still pays the minimums
  assert.equal(tiny.get('chase'), 3500);
  assert.equal(tiny.get('amex'), 9840);
  const lots = allocate(cards, 10_000_000); // never more than owed
  assert.equal(lots.get('amex') + lots.get('chase'), 430000);
});

test('payoff', () => {
  const p = payoff(cards, 60000);
  assert.ok(p.months > 6 && p.months < 12, `months ${p.months}`);
  assert.ok(p.interest > 0);
  const faster = payoff(cards, 70000);
  assert.ok(faster.months <= p.months && faster.interest < p.interest);
  assert.equal(payoff([{ id: 'x', balance: 100000, apr: 30, min: 1000 }], 1000).months, Infinity); // interest > payment
  assert.equal(payoff([], 50000).months, 0);
});

test('bills and card payments are kept apart from everyday spending', () => {
  const list = [
    { date: '2026-11-01', name: 'Rent', cents: 240000, kind: 'bill' },
    { date: '2026-11-02', name: 'Amex payment', cents: 52000, kind: 'card', due: true },
    { date: '2026-11-02', name: 'Coffee', cents: 550 },
  ];
  assert.deepEqual(totals(list), { out: 240550, inn: 0 }); // unpaid card payment not counted yet
  assert.deepEqual(list.filter(isFlex).map((e) => e.name), ['Coffee']);
  const csv = toCSV(list.map((e, i) => ({ ...e, at: i })));
  assert.match(csv, /Amex payment,520\.00,card payment \(not paid yet\)/);
  assert.match(csv, /Rent,2400\.00,bill/);
});

test('habits', () => {
  const list = [1, 2, 3, 4].map((d) => ({ date: `2026-11-0${d}`, name: 'Coffee', cents: 500, at: d }))
    .concat([{ date: '2026-11-02', name: 'Rent', cents: 9000, kind: 'bill', at: 9 }]);
  const h = habits(list, '2026-11-01', '2026-11-30');
  assert.equal(h.length, 1);
  assert.deepEqual([h[0].name, h[0].count, h[0].avg], ['Coffee', 4, 500]);
});

test('sanitizing bills, cards and their entries', () => {
  assert.equal(sanitizeBill({ name: 'Rent', cents: 240000, start: 'x' }), null);
  const b = sanitizeBill({ name: ' Rent ', cents: 240000, start: '2026-12-01', every: 'fortnight' });
  assert.deepEqual([b.name, b.every, b.last], ['Rent', 'month', null]);
  const c = sanitizeCard({ name: 'Amex', balance: 320000, apr: '24.9', start: '2026-11-12' });
  assert.deepEqual([c.apr, c.min], [24.9, 0]);
  const e = sanitizeEntry({ date: '2026-11-12', name: 'Amex payment', cents: 52000, kind: 'card', ref: 'amex', due: true });
  assert.deepEqual([e.kind, e.ref, e.due], ['card', 'amex', true]);
  assert.equal(sanitizeEntry({ date: '2026-11-12', name: 'x', cents: 5, kind: 'weird' }).kind, undefined);
});
