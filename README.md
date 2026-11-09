# Spent

A tiny daily money log. Write what you spent, see the day add up. Made to live on your iPhone's Home Screen.

**Open it:** https://divijps.github.io/spent/

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
- Swipe sideways to move between days. **Today** brings you back.
- Tap the card at the bottom for the month: a bar per day, your budget, and where the money went.
- The search button finds every entry with a name and totals it. With no search, it lists your past days.

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
