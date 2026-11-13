# 📍 Google Maps Reviews Exporter

**Turn any Google Maps place page into a clean CSV or Excel file — in one click.**

Google Business Profile has no "download reviews" button, and the Places API only hands you 5 reviews per place. This extension unlocks **all of them** — stars, full text, dates, owner replies, photos and more — straight from the page you're already looking at.

> 🔓 **Unlimited exports.** No subscription. No 100-review cap. No paywall. Ever.

---

## ✨ Why you'll love it

| | |
|---|---|
| 🚀 **One-click export** | Open a business → click Export → download CSV or Excel. That's it. |
| ♾️ **Truly unlimited** | Every review on the place, no cap, no queue, no Pro tier required. |
| 📊 **Excel Summary sheet** | Auto-generated: average rating, star distribution, owner reply rate, reviews per month. |
| 🔒 **100% private** | Everything runs locally in your browser. Reviews never touch a server. Zero analytics, zero trackers. |
| 🌍 **Works everywhere** | Auto-detects review panels in 10+ languages (English, Indonesian, French, Spanish, German, Russian…). |
| 🎯 **Packed with data** | 14 columns per review — see full spec below. |

---

## 📦 What you get per review

- Reviewer name + profile link
- Local Guide status & review count
- Star rating
- **Full review text** (automatically expands "More" for you)
- Date as shown **plus** an approximate calendar date (multi-locale aware: *"2 weeks ago"*, *"3 bulan yang lalu"*, *"il y a 5 jours"*…)
- Likes count
- Owner reply + reply date
- Number of photos
- Place name & URL

---

## 🎬 How it works

1. **Open** any business on Google Maps.
2. **Click** the extension icon.
3. **Hit** `Export CSV` or `Export Excel`.
4. **Done.** Your file downloads instantly.

> 💡 **Pro tip:** Sign in to Google first — signed-out browsers only get a "limited view" with a handful of reviews.

---

## ⚙️ Options

- **Max reviews** — set `0` for *everything* (the default), or cap it at any number you like.
- **Scroll delay** — gentle 700–3000 ms pacing so Google stays happy during long exports.
- **Include photos count** — toggle the per-review photo count column.

---

## 📥 Install (30 seconds)

**Option A — Release zip (recommended):**
1. Grab the latest release from the [Releases page](../../releases) (`google-maps-reviews-exporter-vX.Y.Z.zip`).
2. Extract the zip.
3. Open `chrome://extensions` and enable **Developer mode**.
4. Click **Load unpacked** and select the extracted folder.
5. Open a place on Google Maps → click the icon → export. 🎉

**Option B — from source:**
1. Clone this repo.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and pick this folder.

---

## 🚀 Cutting a release (maintainers)

Every push of a `v*` tag triggers the [release workflow](.github/workflows/release.yml):

1. **Test** — full suite (CSV, Excel, e2e, manifest).
2. **Build** — packages a clean extension zip (extension files only, no tests).
3. **Release** — publishes a GitHub Release with the zip attached.

```bash
# bump version in manifest.json first, then:
git add manifest.json
git commit -m "Release v0.2.2"
git tag v0.2.2
git push origin main --tags
```

---

## 🧪 Tested & verified

- ✅ 22 unit tests: multi-locale date parsing, timezone-safe math, RFC4180 CSV round-trip, UTF-8 BOM
- ✅ Excel builder: dual-sheet output validated with SheetJS
- ✅ End-to-end pipeline: DOM extraction → CSV + XLSX
- ✅ Manifest v3 compliance

Run them yourself:

```bash
node tests/test_csv.js
node tests/test_xlsx.js
node tests/test_e2e.js
python3 tests/check_manifest.py
```

---

## 🔧 Troubleshooting

**Export comes back empty?**
1. Make sure you're **signed in to Google** (signed-out = limited view).
2. You must be on a **place page** (`/maps/place/...`), not search results.
3. Google rotates CSS class names occasionally — if extraction breaks, see the selector guide in [`README-DEV.md`](README-DEV.md).

---

## 📄 License & Disclaimer

Use responsibly and respect Google's terms and reviewers' rights.

Not affiliated with or endorsed by Google. Google Maps is a trademark of Google LLC.
