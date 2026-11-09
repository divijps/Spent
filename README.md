# Spent

A tiny daily money log. Write what you spent, see the day add up. Made to live on your iPhone's Home Screen.

**Open it:** https://divijps.github.io/Spent/ (capital S; the address is case-sensitive)

## Put it on your iPhone

1. Open the link in Safari.
2. Tap **Share**, then **Add to Home Screen**.
3. From then on, open it from the icon. It runs full screen and works offline.

## Logging

| Type this | You get |
| --- | --- |
| `coffee 5.50` | Coffee, 5.50 spent |
| `5.50 coffee`, `coffee $5.50`, `rent 2,400`, `laptop 1.2k` | the amount is read either way round |
| `+2400 invoice` | money in |

- Your usual entries show up as quick picks under the field. Tap one to log it again.
- Tap a line for its details: what share of the day's limit it took, how often you've bought it this month,
  and a shortcut to every past one. Edit the text at the top to change it; delete from the ••• menu (with undo).
- Tap the date for a row of days. **Go to today** appears at the top when you're on another day.
  Swiping sideways between days works too.
- The ☰ menu has Today, History, Month, Cards, Goals, Bills, Settings and Save a backup.

## The bar at the bottom

Set a **monthly budget** (☰ → Settings: what you have to work with each month, usually your take-home pay) and the
card shows:

- a ring and what you can still spend **today**, out of today's limit. The limit is worked out for you: what's left of the
  month after bills, card payments, money for your goals and what you've already spent, split over the days remaining.
- what's **left this month**
- the next bill, card payment or goal amount, or one waiting to be ticked off

Tap it for the month: what's left, bills against spending, a few insights, a bar per day, what's coming up and
where the money went.

## Cards

☰ → **Cards** shows each card like a Wallet card: its balance and, once you add the credit limit, what's available.
The colour is how much of the limit is used (green under 30%, amber under 60%, red above); silver means no limit yet.

Add the balance, limit, interest rate and due date. Each month the app works out the payment (every minimum first,
then the most toward the highest rate, which costs the least interest) and puts it on the due date with a circle.
Tick it once you've paid and the balance goes down. Update the balance whenever you check it.

## Goals

☰ → **Goals**: things to save for (a safety net, a trip) or invest in, each with an optional target and date.
On each goal's day its amount lands on your list; tick it once you've moved the money. Goals with a date get what
keeps them on time first; the rest is shared evenly.

## The plan

Cards and Goals share one panel. **Each month for cards and goals** is what your budget leaves after bills and your
usual spending (Auto), or an amount you set. Card minimums always come first. The slider splits the rest between
paying off cards and saving or investing, and the payoff and goal dates update as you move it. When the cards are
paid off, their share flows to your goals on its own.

## Bills

☰ → **Bills**: rent, loans, subscriptions. Added to your log on their date, every week, month or year.

## Insights

Worked out on the phone from your own numbers, no AI: where the month is heading with bills, card payments and
goals already set aside (and what a day keeps it on budget), when the cards are paid off, how far along a goal is,
how much of your card limits you're using, how many more times what's left covers things you buy often, and what
your most frequent purchase costs over a year.

## Your data

Entries are saved in your phone's browser storage and never leave it. This repo holds only the app.

iPhone keeps the Home Screen app's storage separate from Safari's, and removing the icon can remove its data.
Use **☰ → Save a backup** now and then. **Restore a backup** merges it back without duplicates.
**Export as spreadsheet** gives you a CSV for Numbers, Excel or Google Sheets.

## Changing it

Plain HTML, CSS and JavaScript, with no build step. Serve the folder with any static server
(`python3 -m http.server`) and open it in a browser.

- `lib.js` — parsing, dates, totals, the card and goal plan (no DOM; covered by tests)
- `app.js` — the interface
- `sw.js` — offline cache. Bump `CACHE` when you add or rename files.
- Tests: `node --test tests/lib.test.js`

## Publishing

GitHub Pages serves the `gh-pages` branch. After changing `main`, publish with:

```sh
git push origin main main:gh-pages
```

(Or set **Settings → Pages → Source** to `main` and push only to `main`.)
