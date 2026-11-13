# 🔧 Developer Guide — Maps Reviews Exporter

Technical notes for contributors and anyone debugging selector breakage.

---

## Architecture

```
popup.html       UI shell (options + status + buttons)
popup.js         Controller + injected scraper payload (scraperSource())
background.js    Minimal MV3 service worker
xlsx.full.min.js SheetJS (local Excel generation, no CDN)
manifest.json    MV3 — activeTab, scripting, downloads
```

The scraper is defined as a **self-contained factory function** inside `popup.js` (`scraperSource()`) and injected into the Maps page via `chrome.scripting.executeScript`. It exposes `window.__mre` with `run(opts)`, `status()`, and `requestStop()`.

---

## Live Google Maps selectors (verified Nov 2026)

| Data | Selector |
|---|---|
| Review card | `div.jftiEf` or `div[data-review-id]` |
| Reviewer name | `.d4r55` |
| Star rating | `span.kvMYJc` (parse `aria-label` e.g. `"5 stars"`) |
| Review text | `.wiI7pd` or `span[jsname='bN97Pc']` |
| Relative date | `.rsqaWe` |
| "More" expand button | `button.w8nwRe.kyuRq` / `button.kyuRq` |
| Photos | `.Tya61d` (background-image URLs) |
| Likes | `.pkWtMe` |
| Local Guide info | `.RfnDt` |
| Reviewer profile | `button.WEBjve[data-href]` |
| Reviews scroll container | `div[role='feed']` or `div.m6QErb.DxyBCb.kA9KIf` |

> ⚠️ **Google rotates class names periodically.** If exports come back empty, open DevTools on the Maps page and inspect a review card to grab the new classes, then update the `SELECTORS` object in `popup.js`.

---

## Multi-locale review-tab detection

The scraper auto-clicks the reviews tab/button by matching any of:

```
Reviews | Ulasan | Avis | Recensioni | Bewertungen | Reseñas | Отзывы | avaliações | opinions | 후기 | レビュー
```

Owner reply detection looks for markers like:

```
Response from the owner | Balas dari pemilik | Réponse du propriétaire | Respuesta del propietario | Antwort des Inhabers
```

---

## Date handling (`relToDate`)

- Relative dates (`"2 weeks ago"`, `"3 bulan yang lalu"`, `"il y a 5 jours"`, `"hace 2 días"`) are converted to approximate ISO dates using **UTC-safe arithmetic** (avoids timezone off-by-one).
- Absolute dates with a year (`"12 Jan 2025"`, `"Jan 12, 2025"`) are parsed directly with local formatting.
- The original date-as-shown string is preserved in a separate column.

---

## Test suite

```bash
node tests/test_csv.js       # date parsing (22 cases) + RFC4180 CSV round-trip + BOM
node tests/test_xlsx.js      # 50-review workbook → 2 sheets, Summary content verified
node tests/test_e2e.js       # fixture DOM → extraction → CSV + XLSX full pipeline
python3 tests/check_manifest.py  # MV3 manifest compliance
```

All suites pass as of 2026-11-13.

---

## Known limitations

- Requires Google sign-in for full review access (signed-out = "limited view").
- Must be on a `/maps/place/` URL, not search results.
- Very large places (10k+ reviews) may take several minutes; use a gentler scroll delay.
