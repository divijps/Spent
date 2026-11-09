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
- Tap a line to change it. Clear the text, or tap ×, to delete it (with undo).
- Swipe sideways to move between days. Tap the date to come back to today.

## The bar at the bottom

Set a **monthly budget** (menu, top left: everything you can spend in a month, bills included) and the bar shows:

- what you can still spend **today**, out of today's limit. The limit is worked out for you: what's left of the
  month after bills, card payments and what you've already spent, split over the days remaining.
- what's **left this month**
- the next bill or card payment, or a card payment waiting to be made

Tap it for the month: what's left, bills against spending, a few insights, a bar per day, what's coming up and
where the money went.

## Bills and cards

Menu → **Bills and cards**.

- **Bills** (rent, student loan…) are added to your log on their date, every week, month or year.
- **Cards**: add what you owe, the interest rate and the due date. Each month the app works out the payment
  (every minimum first, then the rest to the highest rate, which costs the least interest) and puts it on the due
  date with a circle. Tick it once you've paid; the balance goes down.
  **Per month** is what goes to cards in total. Leave it on Auto and it uses what your budget has left after
  bills and your usual spending.
- Only add cards with a balance you're paying down. If you clear a card in full every month, what you log
  already counts.

## Insights

Worked out on the phone from your own numbers, no AI: how the month ends at your current pace, how many more times
what's left covers things you buy often, when the cards are paid off (and how much sooner with $100 more a month),
and what your most frequent purchase costs over a year.

## Your data

Entries are saved in your phone's browser storage and never leave it. This repo holds only the app.

iPhone keeps the Home Screen app's storage separate from Safari's, and removing the icon can remove its data.
Use **menu → Save a backup** now and then. **Restore a backup** merges it back without duplicates.
**Export as spreadsheet** gives you a CSV for Numbers, Excel or Google Sheets.

## Changing it

Plain HTML, CSS and JavaScript, with no build step. Serve the folder with any static server
(`python3 -m http.server`) and open it in a browser.

- `lib.js` — parsing, dates, totals (no DOM; covered by tests)
- `app.js` — the interface
- `sw.js` — offline cache. Bump `CACHE` when you add or rename files.
- Tests: `node --test tests/lib.test.js`

## Publishing

GitHub Pages serves the `gh-pages` branch. After changing `main`, publish with:

```sh
git push origin main main:gh-pages
```

(Or set **Settings → Pages → Source** to `main` and push only to `main`.)
