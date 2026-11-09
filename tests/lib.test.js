// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseEntry, toNumber, editText, fmtPlain, fmtMoney, weekRange, addDays, addMonths,
  daysInMonth, totals, groupByName, suggest, toCSV, sanitizeEntry,
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
