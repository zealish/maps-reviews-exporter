/**
 * Maps Reviews Exporter — popup controller & content-script payload.
 * Runs 100% locally. No analytics, no network calls outside the Maps page.
 */

const $ = (id) => document.getElementById(id);

let busy = false;

const state = {
  place: null, // {name, rating, reviewCount, url}
  running: false,
  stopRequested: false,
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function setStatus(msg, kind = "") {
  const el = $("status");
  el.style.display = "block";
  el.className = "status" + (kind ? " " + kind : "");
  el.textContent = msg;
}

function setProgress(pct) {
  const bar = $("bar");
  if (pct === null) {
    bar.style.display = "none";
    return;
  }
  bar.style.display = "block";
  $("barFill").style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fileName(place, ext) {
  const base = (place && place.name ? place.name : "maps-reviews")
    .replace(/[^\p{L}\p{N} _-]/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${base}_${ts}.${ext}`;
}

/* ------------------------------------------------------------------ */
/* Injected scraper (runs inside the Maps page)                       */
/* ------------------------------------------------------------------ */

function scraperSource() {
  return function MapsReviewsScraperFactory() {
    const OUT = {
      ready: false,
      error: null,
      place: null,
      reviews: [],
      phase: "init",
      found: 0,
      total: 0,
      note: "",
    };

    const SELECTORS = {
      card: "div.jftiEf",
      cardAlt: "div[data-review-id]",
      name: ".d4r55",
      text: ".wiI7pd, span[jsname='bN97Pc']",
      date: ".rsqaWe",
      rating: "span.kvMYJc, span[aria-label*='out of 5'], span[aria-label*='bintang']",
      more: "button.w8nwRe.kyuRq, button.kyuRq",
      likes: ".pkWtMe",
      photos: ".Tya61d",
      profile: "button.WEBjve[data-href], button[data-href]",
      localGuide: ".RfnDt",
      feed: "div[role='feed'], div.m6QErb.DxyBCb.kA9KIf",
    };

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function q(root, sel) {
      try {
        return root.querySelector(sel);
      } catch {
        return null;
      }
    }

    function qa(root, sel) {
      try {
        return Array.from(root.querySelectorAll(sel));
      } catch {
        return [];
      }
    }

    function norm(s) {
      return (s || "").replace(/\s+/g, " ").trim();
    }

    /* ---- place header detection ---- */
    function detectPlace() {
      // prefer the longest non-empty h1: Maps stacks h1s ("Hasil"/""/place name)
      let name = "";
      for (const h of document.querySelectorAll("h1")) {
        const t = norm(h.innerText);
        if (t.length > name.length) name = t;
      }
      let rating = "";
      let reviewCount = "";
      // rating: prefer aria-label near place heading; fallback to text like "4,7" in header
      const ratingEl =
        [...document.querySelectorAll("span,div")].find((e) =>
          (e.getAttribute("aria-label") || "").match(/[\d]+[.,][\d]+\s*(star|bintang)/i)
        ) || null;
      if (ratingEl) {
        const m = (ratingEl.getAttribute("aria-label") || "").match(/([\d]+[.,][\d]+)/);
        if (m) rating = m[1].replace(",", ".");
      } else {
        // heading area numeric like 4,7
        for (const h of document.querySelectorAll("h1")) {
          const parent = h.closest("div[role='main']") || h.parentElement;
          if (!parent) continue;
          const m = parent.innerText.match(/\b(\d[.,]\d)\b/);
          if (m) { rating = m[1].replace(",", "."); break; }
        }
      }
      // "(1.234)" right after headline / rating area
      const body = (document.querySelector("div[role='main']") || document.body).innerText.slice(0, 1500);
      const cm = body.match(/\(([\d.,]+)\)/);
      if (cm) reviewCount = cm[1];
      if (!reviewCount) {
        const rm = body.match(/([\d.,]+)\s*(ulasan|reviews|avis|Bewertungen|recensioni)/i);
        if (rm) reviewCount = rm[1];
      }
      return { name, rating, reviewCount, url: location.href };
    }

    /* ---- open reviews tab (multi-strategy) ---- */
    function reviewCards() {
      return document.querySelectorAll(SELECTORS.card + "," + SELECTORS.cardAlt).length;
    }

    async function tryNavigateToReviews() {
      // Strategy: rewrite /maps/place/<slug>/... URL to include !8m2!4m1!8e2
      // which deep-links to the Reviews tab (CUID icon: reviews).
      try {
        const u = new URL(location.href);
        if (!u.pathname.includes("/maps/place/")) return false;
        const parts = u.pathname.split("!");
        if (parts.some((p) => p === "8e2")) return false; // already there
        // find the last !4m segment (module root) and append !8m2!4m1!8e2
        const nm = u.pathname.lastIndexOf("!4m");
        if (nm < 0) return false;
        const np = u.pathname.slice(0, nm) + "!8m2!4m1!8e2" + u.pathname.slice(nm);
        history.pushState({}, "", np + u.search);
        // force Maps to react to URL change
        window.dispatchEvent(new PopStateEvent("popstate"));
        await sleep(3500);
        if (reviewCards() > 0) return true;
        return false;
      } catch {
        return false;
      }
    }

    async function openReviewsTab() {
      if (reviewCards() > 0) return true;

      // 1) buttons/tabs whose label mentions reviews (any locale)
      const reviewish = /^(reviews?|ulasan|avis|recensioni|bewertungen|reseñas|отзывы|отзыв|avaliações|opinions|후기|レビュー)/i;
      const cands = [...document.querySelectorAll("button,div[role='tab'],span,a")].filter((e) => {
        const t = norm(e.innerText);
        return t.length > 0 && t.length < 60 && reviewish.test(t) && e.children.length <= 4;
      });
      for (const el of cands) {
        try { el.click(); } catch {}
        await sleep(1800);
        if (reviewCards() > 0) return true;
      }

      // 2) star-headline element (aria-label like "4.6 stars") — click its ancestors
      const starEl = [...document.querySelectorAll("span,div,button")].find((e) =>
        /[\d]+[.,][\d]+\s*(star|bintang|étoiles|stelle|estrellas|звёзд)/i.test(e.getAttribute("aria-label") || "") ||
        /^[\d]+[.,][\d]+\s*$/.test(norm(e.innerText)) && e.closest("div[role='main']")
      );
      if (starEl) {
        let a = starEl;
        for (let depth = 0; depth < 6 && a; depth++) {
          try { a.click(); } catch {}
          await sleep(1500);
          if (reviewCards() > 0) return true;
          a = a.parentElement;
        }
      }

      // 3) rating + "(n)" text row
      const row = [...document.querySelectorAll("div,span,button")].find((e) => {
        const t = norm(e.innerText);
        return e.children.length <= 6 && t.length < 40 && /\([\d.,]+\)/.test(t) && /[\d][.,][\d]/.test(t);
      });
      if (row) {
        try { row.click(); } catch {}
        await sleep(1800);
        if (reviewCards() > 0) return true;
      }

      // 4) direct URL navigation to reviews tab
      if (await tryNavigateToReviews()) return true;

      return reviewCards() > 0;
    }

    /* ---- find the scrollable reviews container ---- */
    function findFeed() {
      const explicit = q(document, "div[role='feed']");
      if (explicit && explicit.scrollHeight > explicit.clientHeight + 50) return explicit;
      // review card ancestor that scrolls
      const card = q(document, SELECTORS.card + "," + SELECTORS.cardAlt);
      if (card) {
        let p = card.parentElement;
        while (p && p !== document.body) {
          if (p.scrollHeight > p.clientHeight + 50 && p.clientHeight > 200) return p;
          p = p.parentElement;
        }
      }
      const classic = q(document, "div.m6QErb.DxyBCb.kA9KIf");
      if (classic) return classic;
      return null;
    }

    /* ---- parse one card ---- */
    function parseCard(card, withPhotos) {
      const id = card.getAttribute("data-review-id") || "";
      const nameEl = q(card, SELECTORS.name);
      const textEl = q(card, SELECTORS.text);
      const dateEl = q(card, SELECTORS.date);
      const rateEl = q(card, SELECTORS.rating);
      const likesEl = q(card, SELECTORS.likes);
      const lgEl = q(card, SELECTORS.localGuide);

      let rating = "";
      if (rateEl) {
        const aria = rateEl.getAttribute("aria-label") || "";
        const m = aria.match(/([\d]+(?:[.,][\d]+)?)/);
        if (m) rating = m[1].replace(",", ".");
        else {
          const cls = rateEl.className || "";
          // fallback: count filled star glyphs in sibling spans
          const starCount = qa(card, "span").filter((s) =>
            /filled|full|ON|active/i.test(s.className || "")
          ).length;
          if (starCount > 0 && starCount <= 5) rating = String(starCount);
        }
      }

      // profile link
      let profile = "";
      const profEl = q(card, SELECTORS.profile);
      if (profEl) profile = profEl.getAttribute("data-href") || profEl.href || "";

      // likes: "12" or "12 Suka"
      let likes = "";
      if (likesEl) {
        const lm = norm(likesEl.innerText).match(/[\d.,]+/);
        if (lm) likes = lm[0];
      }

      // photos count: background-image thumbnails
      let photos = 0;
      if (withPhotos) {
        photos = qa(card, SELECTORS.photos).length;
      }

      // local guide info
      const localGuide = lgEl ? norm(lgEl.innerText) : "";

      // owner reply detection: reviews contain a "Balas"/"Response from the owner" block
      let ownerReply = "";
      let ownerReplyDate = "";
      const replyMarker = [...card.querySelectorAll("span,div")].find((e) =>
        /^(response from the owner|balasan dari pemilik|réponse du propriétaire|respuesta del propietario|antwort des inhabers)/i.test(
          norm(e.innerText)
        )
      );
      if (replyMarker) {
        const block = replyMarker.closest("div.jftiEf, div") || replyMarker.parentElement;
        const rText = q(block, SELECTORS.text);
        const rDate = q(block, SELECTORS.date);
        ownerReply = rText ? norm(rText.innerText) : "";
        ownerReplyDate = rDate ? norm(rDate.innerText) : "";
      }

      return {
        id,
        name: nameEl ? norm(nameEl.innerText) : "",
        profile,
        rating,
        text: textEl ? norm(textEl.innerText) : "",
        date: dateEl ? norm(dateEl.innerText) : "",
        likes,
        localGuide,
        photos,
        ownerReply,
        ownerReplyDate,
      };
    }

    /* ---- expand all "More" buttons in view ---- */
    function expandVisible() {
      let n = 0;
      for (const b of qa(document, SELECTORS.more)) {
        try {
          b.click();
          n++;
        } catch {}
      }
      return n;
    }

    /* ---- main export loop ---- */
    async function run(opts) {
      OUT.phase = "checking page";
      const onMaps = /google\.[a-z.]+\/maps\//.test(location.host + location.pathname) || /\/maps\//.test(location.pathname);
      if (!onMaps) {
        OUT.error = "Not a Google Maps page. Open a place on Google Maps first.";
        OUT.ready = true;
        return OUT;
      }

      OUT.place = detectPlace();

      OUT.phase = "opening reviews";
      const opened = await openReviewsTab();
      if (!opened) {
        OUT.error =
          "Reviews panel not found. Open a business place page (not search results), make sure you are signed in to Google (signed-out users get a limited view), then retry.";
        OUT.ready = true;
        return OUT;
      }

      await sleep(800);
      OUT.place = detectPlace();

      const max = Number(opts.maxReviews) || 0;
      const delay = Number(opts.delay) || 1200;
      const withPhotos = !!opts.withPhotos;
      const seen = new Map(); // id -> index
      let stagnantRounds = 0;
      let round = 0;

      OUT.phase = "collecting";

      while (!OUT.stopRequested) {
        round++;
        expandVisible();
        await sleep(350);

        const cards = qa(document, SELECTORS.card + "," + SELECTORS.cardAlt);
        let added = 0;
        for (const card of cards) {
          const parsed = parseCard(card, withPhotos);
          const key = parsed.id || (parsed.name + "|" + parsed.date + "|" + parsed.text.slice(0, 60));
          if (!seen.has(key)) {
            seen.set(key, OUT.reviews.length);
            OUT.reviews.push(parsed);
            added++;
          } else {
            // refresh entry (text may have expanded after "More" click)
            const idx = seen.get(key);
            const old = OUT.reviews[idx];
            if ((parsed.text && parsed.text.length > old.text.length) || (!old.photos && parsed.photos)) {
              OUT.reviews[idx] = parsed;
            }
          }
        }

        OUT.found = OUT.reviews.length;
        OUT.total = Number(OUT.place.reviewCount ? String(OUT.place.reviewCount).replace(/\D/g, "") : 0);

        if (max > 0 && OUT.reviews.length >= max) {
          OUT.reviews = OUT.reviews.slice(0, max);
          OUT.found = OUT.reviews.length;
          OUT.note = "max reached";
          break;
        }

        const feed = findFeed();
        if (feed) {
          feed.scrollTop = feed.scrollHeight;
        } else {
          window.scrollTo(0, document.body.scrollHeight);
        }

        await sleep(delay);

        if (added === 0) {
          stagnantRounds++;
        } else {
          stagnantRounds = 0;
        }

        // no progress for 3 consecutive gentle scrolls = end of feed
        if (stagnantRounds >= 3) {
          OUT.note = "end of feed";
          break;
        }

        if (round > 5000) {
          OUT.note = "safety cap";
          break;
        }

        OUT.phase = "collecting";
      }

      OUT.phase = "done";
      OUT.ready = true;
      OUT.found = OUT.reviews.length;
      return OUT;
    }

    /* expose runner on window.__mre */
    window.__mre = {
      // fire-and-forget: returns immediately, progress readable via status()
      run(opts) {
        OUT.stopRequested = false;
        OUT.ready = false;
        OUT.error = null;
        run(opts).catch((e) => {
          OUT.error = String((e && e.message) || e);
          OUT.ready = true;
        });
        return "started";
      },
      requestStop() {
        OUT.stopRequested = true;
      },
      status() {
        return OUT;
      },
    };
    return "installed";
  };
}

/* ------------------------------------------------------------------ */
/* Chrome messaging glue                                               */
/* ------------------------------------------------------------------ */

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function ensureScraper(tabId) {
  // probe existing
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => !!window.__mre,
    });
    if (probe && probe[0] && probe[0].result) return true;
  } catch (e) {
    /* fallthrough */
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    func: scraperSource(),
  });
  return true;
}

async function pollUntilDone(tabId, onTick) {
  while (true) {
    const res = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => (window.__mre ? window.__mre.status() : { ready: false, error: "scraper missing" }),
    });
    const st = res && res[0] && res[0].result;
    if (!st) throw new Error("lost connection to page");
    onTick(st);
    if (st.ready || st.error) return st;
    await sleep(700);
  }
}

/* ------------------------------------------------------------------ */
/* Export builders                                                     */
/* ------------------------------------------------------------------ */

const CSV_HEADERS = [
  "review_id",
  "reviewer_name",
  "profile_link",
  "local_guide_info",
  "rating",
  "review_text",
  "review_date",
  "likes",
  "photo_count",
  "owner_reply",
  "owner_reply_date",
  "place_name",
  "place_url",
  "exported_at",
];

function reviewRow(r, place, exportedAt) {
  return [
    r.id,
    r.name,
    r.profile,
    r.localGuide,
    r.rating,
    r.text,
    r.date,
    r.likes,
    r.photos,
    r.ownerReply,
    r.ownerReplyDate,
    place ? place.name : "",
    place ? place.url : "",
    exportedAt,
  ];
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildCsv(reviews, place, exportedAt) {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of reviews) lines.push(reviewRow(r, place, exportedAt).map(csvEscape).join(","));
  // BOM supaya Excel detect UTF-8
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function relToDate(rel, ref = new Date()) {
  // "2 weeks ago", "3 bulan yang lalu", "il y a 2 mois", "hace 3 días",
  // or absolute like "12 Jan 2025" / "Jan 12, 2025"
  if (!rel) return "";
  const raw = rel.trim();

  // absolute date with a year → parse directly (before any relative matching,
  // otherwise "Jan" matches the "an" year-alternation)
  if (/(^|\D)(19|20)\d{2}(\D|$)/.test(raw)) {
    const isoOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (isoOnly) return isoOnly[1];
    const p = Date.parse(raw);
    if (!isNaN(p)) {
      // format with LOCAL getters: Date.parse of "12 Jan 2025" yields local
      // midnight, so local formatting gives back the date as shown regardless of TZ
      const d = new Date(p);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }

  const s = raw.toLowerCase();
  if (/a moment|just now|baru saja|pour l.instant|recién|hace un momento/.test(s)) {
    return new Date(ref.getTime()).toISOString().slice(0, 10);
  }

  const num = (s.match(/(\d+)/) || [])[1];
  const n = num ? parseInt(num, 10) : 1;
  const map = [
    [/\b(seconds?|detik|seconde[s]?|sekunde?|segundos?|секунд[ыа]?)\b/, "s"],
    [/\b(minutes?|menit|minute[s]?|minuten|minutos?|минут[ыа]?)\b/, "m"],
    [/\b(hours?|jam|heure[s]?|stunde[n]?|horas?|час[а-яё]*)\b/, "h"],
    [/\b(days?|hari|jour[s]?|tage?|días?|дн[ьяю]*)\b/, "d"],
    [/\b(weeks?|minggu|semaine[s]?|wochen?|semanas?|недел[ьяю]*)\b/, "w"],
    [/\b(months?|bulan|monate?|mes|месяц[а-яё]*)\b/, "M"],
    [/\b(years?|tahun|années?|jahre?|años?|год[а-яё]*)\b/, "y"],
  ];
  let unit = null;
  for (const [re, u] of map) {
    if (re.test(s)) {
      unit = u;
      break;
    }
  }
  if (!unit) {
    const parsed = Date.parse(raw);
    if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
    return "";
  }

  // UTC-safe arithmetic (avoids local-TZ off-by-one around midnight)
  const d = new Date(ref.getTime());
  if (unit === "M") d.setUTCMonth(d.getUTCMonth() - n);
  else if (unit === "y") d.setUTCFullYear(d.getUTCFullYear() - n);
  else {
    const ms = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5 }[unit];
    d.setTime(d.getTime() - n * ms);
  }
  return d.toISOString().slice(0, 10);
}

function distFromReviews(reviews) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0,
    cnt = 0;
  for (const r of reviews) {
    const v = parseFloat(String(r.rating).replace(",", "."));
    if (!isNaN(v) && v >= 1 && v <= 5) {
      const bucket = Math.min(5, Math.max(1, Math.round(v)));
      dist[bucket]++;
      sum += v;
      cnt++;
    }
  }
  const avg = cnt ? sum / cnt : 0;
  return { dist, avg, cnt };
}

function buildXlsx(reviews, place, exportedAt) {
  const XLSX = window.XLSX;
  const aoa = [CSV_HEADERS];
  for (const r of reviews) aoa.push(reviewRow(r, place, exportedAt));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 18 }, // id
    { wch: 24 }, // name
    { wch: 40 }, // profile
    { wch: 18 }, // local guide
    { wch: 8 }, // rating
    { wch: 60 }, // text
    { wch: 16 }, // date
    { wch: 8 }, // likes
    { wch: 8 }, // photos
    { wch: 50 }, // reply
    { wch: 16 }, // reply date
    { wch: 28 }, // place
    { wch: 50 }, // url
    { wch: 22 }, // exported
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reviews");

  /* ---- Summary sheet ---- */
  const { dist, avg, cnt } = distFromReviews(reviews);
  const withReply = reviews.filter((r) => r.ownerReply).length;
  const replyRate = reviews.length ? ((withReply / reviews.length) * 100).toFixed(1) + "%" : "0%";

  // reviews per month from relative dates (approximate)
  const perMonth = {};
  for (const r of reviews) {
    const iso = relToDate(r.date);
    if (iso) {
      const ym = iso.slice(0, 7);
      perMonth[ym] = (perMonth[ym] || 0) + 1;
    }
  }
  const monthRows = Object.keys(perMonth)
    .sort()
    .reverse()
    .slice(0, 24)
    .map((m) => [m, perMonth[m]]);

  const sumAoa = [
    ["Place", place ? place.name : ""],
    ["URL", place ? place.url : ""],
    ["Overall rating (Maps)", place ? place.rating : ""],
    ["Total reviews (Maps)", place ? place.reviewCount : ""],
    ["Exported reviews", reviews.length],
    ["Exported at", exportedAt],
    [],
    ["Rating distribution (exported)"],
    ["Stars", "Count", "Share"],
    [5, dist[5], reviews.length ? ((dist[5] / reviews.length) * 100).toFixed(1) + "%" : "0%"],
    [4, dist[4], reviews.length ? ((dist[4] / reviews.length) * 100).toFixed(1) + "%" : "0%"],
    [3, dist[3], reviews.length ? ((dist[3] / reviews.length) * 100).toFixed(1) + "%" : "0%"],
    [2, dist[2], reviews.length ? ((dist[2] / reviews.length) * 100).toFixed(1) + "%" : "0%"],
    [1, dist[1], reviews.length ? ((dist[1] / reviews.length) * 100).toFixed(1) + "%" : "0%"],
    [],
    ["Average rating (exported)", cnt ? Number(avg.toFixed(2)) : ""],
    ["Reviews with owner reply", withReply],
    ["Owner reply rate", replyRate],
    [],
    ["Reviews per month (approximate from relative dates)"],
    ["Month", "Reviews"],
    ...monthRows,
  ];
  const wsSum = XLSX.utils.aoa_to_sheet(sumAoa);
  wsSum["!cols"] = [{ wch: 36 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsSum, "Summary");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Uint8Array(out);
}

function downloadBlob(bytes, mime, name) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename: name, saveAs: false }, () => {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

/* ------------------------------------------------------------------ */
/* Export flow                                                         */
/* ------------------------------------------------------------------ */

async function startExport(fmt) {
  if (busy) return;
  busy = true;
  state.stopRequested = false;

  const btnCsv = $("btnCsv");
  const btnXls = $("btnXls");
  const btnStop = $("btnStop");
  btnCsv.disabled = btnXls.disabled = true;
  btnStop.style.display = "block";
  setStatus("Checking page…");
  setProgress(5);

  try {
    const tab = await getActiveTab();
    if (!tab || !tab.id) throw new Error("no active tab");

    if (!/google\.[^/]+\/maps\//.test(tab.url || "")) {
      throw new Error("Buka dulu halaman tempat (business) di Google Maps, lalu klik Export lagi.");
    }

    await ensureScraper(tab.id);

    const opts = {
      maxReviews: parseInt($("maxReviews").value, 10) || 0,
      delay: parseInt($("delay").value, 10) || 1200,
      withPhotos: $("withPhotos").value === "1",
    };

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (o) => window.__mre.run(o),
      args: [opts],
    });

    let lastCount = -1;
    const st = await pollUntilDone(tab.id, (s) => {
      if (s.error) return;
      const placeTxt = s.place && s.place.name ? s.place.name : "";
      const total = s.total ? ` / ${s.total}` : "";
      setStatus(`${s.phase === "collecting" ? "Collecting" : s.phase}… ${s.found}${total} reviews — ${placeTxt}`);
      if (s.total) setProgress(Math.min(95, (s.found / s.total) * 100));
      else setProgress(null);
      lastCount = s.found;
    });

    if (st.error) {
      setStatus(st.error, "error");
      setProgress(null);
      return;
    }

    if (state.stopRequested) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__mre.requestStop(),
      });
    }

    const reviews = st.reviews || [];
    if (!reviews.length) {
      setStatus("No reviews found. Pastikan halaman tempat terbuka dan Anda sudah sign in Google.", "error");
      setProgress(null);
      return;
    }

    setStatus(`Building ${fmt === "csv" ? "CSV" : "Excel"} file…`);
    const exportedAt = new Date().toISOString();
    const place = st.place;

    if (fmt === "csv") {
      const csv = buildCsv(reviews, place, exportedAt);
      downloadBlob(new TextEncoder().encode(csv), "text/csv;charset=utf-8", fileName(place, "csv"));
    } else {
      const bytes = buildXlsx(reviews, place, exportedAt);
      downloadBlob(
        bytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        fileName(place, "xlsx")
      );
    }

    setProgress(100);
    setStatus(
      `✓ Exported ${reviews.length} reviews (${st.note || "done"}) — ${place ? place.name : ""}`,
      "ok"
    );
  } catch (e) {
    setStatus("Error: " + (e && e.message ? e.message : String(e)), "error");
    setProgress(null);
  } finally {
    busy = false;
    $("btnCsv").disabled = $("btnXls").disabled = false;
    $("btnStop").style.display = "none";
  }
}

async function stopExport() {
  state.stopRequested = true;
  try {
    const tab = await getActiveTab();
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__mre && window.__mre.requestStop(),
    });
  } catch {}
  setStatus("Stopping after current scroll…");
}

/* ------------------------------------------------------------------ */
/* Page detection on open                                             */
/* ------------------------------------------------------------------ */

async function init() {
  try {
    const tab = await getActiveTab();
    if (tab && /google\.[^/]+\/maps\//.test(tab.url || "")) {
      if (/\/maps\/place\//.test(tab.url)) {
        // quick place name from title
        const t = (tab.title || "").replace(/\s*-\s*Google Maps.*$/i, "").replace(/^\S+\s/, (m) => m);
        $("placeName").textContent = (tab.title || "Google Maps").replace(/\s*[-–]\s*Google Maps.*$/i, "");
        $("placeMeta").textContent = "Place page detected. Click Export to start.";
      } else {
        $("placeName").textContent = "Google Maps";
        $("placeMeta").textContent =
          "You're on Maps. Open a specific business place page (not search results) for best results.";
      }
    } else {
      $("placeName").textContent = "Not on Google Maps";
      $("placeMeta").textContent = "Open a business on Google Maps, then click Export.";
      $("btnCsv").disabled = $("btnXls").disabled = true;
    }
  } catch (e) {
    $("placeMeta").textContent = "Cannot read tab: " + e.message;
  }
}

$("btnCsv").addEventListener("click", () => startExport("csv"));
$("btnXls").addEventListener("click", () => startExport("xlsx"));
$("btnStop").addEventListener("click", stopExport);
init();
