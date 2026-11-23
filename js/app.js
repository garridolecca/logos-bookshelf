"use strict";
// Logos Bookshelf. Row layout of data/books.json:
// 0 rid, 1 title, 2 authors, 3 category, 4 year, 5 kind, 6 pages, 7 subjects, 8 series, 9 lang, 10 dupOf (index or -1); 11 = own index (added here)
const $ = (id) => document.getElementById(id);
const BIBLE = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Songs","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"];
const CHAPTERS = [50,40,27,36,34,24,21,4,31,24,22,25,29,36,10,13,10,42,150,31,12,8,66,52,5,48,12,14,3,9,1,4,7,3,3,3,2,14,4,28,16,24,21,28,16,16,13,6,6,4,4,5,3,6,4,3,1,13,5,5,3,5,1,1,1,22];
const LANGS = { en: "English", grc: "Greek", la: "Latin", he: "Hebrew", de: "German", fr: "French", es: "Spanish", other: "Other languages" };
const GAP = 2, PAD = 20;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } },
};
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

let STATUS = json(store.get("lbs-status", "{}"), {}); // rid -> read | reading | want (this browser only)
const STATUS_LABEL = { read: "Read", reading: "Reading", want: "Want to read" };
let BOOKS = [], CATS = [], PRIV = null, VER = "0", TWINS = new Map();
let COLS = json(store.get("lbs-cols", "{}"), {});         // name -> [rid]
let NOTES = json(store.get("lbs-notes", "{}"), {});       // rid -> text
const S = {
  status: "", q: "", group: "category", sort: "title", target: "web", view: "spines", dups: false,
  author: "", subject: "", series: "", col: "", only: false, edit: false,
  pb: 0, pch: 0,           // passage: Bible book number (1..66), chapter (0 = whole book)
  shared: null,            // {name, rids} from a ?share= link
};
let REFS = null, REFSKEY = "", passageMap = null, lastDetail = -1;
const refsCache = new Map();

// ---------------------------------------------------------------- helpers
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
let RECENT = json(store.get("lbs-recent", "[]"), []);
function noteOpened(rid) { RECENT = [rid, ...RECENT.filter((r) => r !== rid)].slice(0, 15); store.set("lbs-recent", JSON.stringify(RECENT)); }
function toast(t) { const el = $("toast"); el.textContent = t; el.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => { el.style.display = "none"; }, 2200); }
function webUrl(rid) { return "https://app.logos.com/books/" + encodeURIComponent(rid); }
function appUrl(rid) { return "logosres:" + encodeURIComponent(rid); }
function href(b) { return S.target === "app" ? appUrl(b[0]) : S.target === "details" ? "#" : webUrl(b[0]); }
function parts(s) { return (s || "").split(";").map((x) => x.trim()).filter(Boolean); }
function firstAuthorLetter(b) { const a = (b[2].split(";")[0] || "").trim().charAt(0).toUpperCase(); return /[A-Z]/.test(a) ? a : "#"; }
function colRids() { return S.shared && S.col === "__shared__" ? S.shared.rids : (COLS[S.col] || []); }
function colSet() { return new Set(colRids()); }
function saveCols() { store.set("lbs-cols", JSON.stringify(COLS)); }
function coverUrl(b) { const p = PRIV && PRIV[b[0]]; return p && p.cover ? "data/covers/" + p.cover.replace(/^covers\//, "") : ""; }
function driveUrl(b) { const p = PRIV && PRIV[b[0]]; return p && p.pdf ? "https://drive.google.com/file/d/" + p.pdf + "/view" : ""; }

function look(b) {
  const h = hash(b[0]);
  const ci = Math.max(0, CATS.indexOf(b[3]));
  const hue = (ci * 47 + (h % 14) - 7 + 360) % 360, sat = 32 + (h >> 4) % 26, lig = 24 + (h >> 9) % 16;
  const w = Math.max(16, Math.min(50, Math.round(10 + Math.sqrt(b[6] || 20) * 2.3)));
  return { w, ht: 150 + (h >> 13) % 72, bg: `linear-gradient(90deg, hsl(${hue} ${sat}% ${lig + 6}%), hsl(${hue} ${sat}% ${lig}%) 55%, hsl(${hue} ${sat}% ${lig - 5}%))` };
}

// ---------------------------------------------------------------- state in the URL
function readUrl() {
  const p = new URLSearchParams(location.search);
  const g = (k, d = "") => p.get(k) ?? d;
  S.q = g("q"); S.group = g("g", S.group); S.sort = g("s", S.sort); S.target = g("t", S.target);
  S.author = g("a"); S.subject = g("sub"); S.series = g("ser"); S.dups = p.get("dup") === "1";
  S.view = g("v", S.view); if (S.view !== "covers") S.view = "spines";
  const ps = g("p");
  if (ps) { const m = /^(\d+)(?:\.(\d+))?$/.exec(ps); if (m) { S.pb = +m[1]; S.pch = +(m[2] || 0); } }
  const sh = g("share");
  if (sh) { const i = sh.indexOf("~"); if (i > 0) { S.shared = { name: sh.slice(0, i), rids: sh.slice(i + 1).split(",").filter(Boolean).map(decodeURIComponent) }; S.col = "__shared__"; S.only = true; } }
  const c = g("c"); if (c && COLS[c]) { S.col = c; S.only = p.get("only") === "1"; }
  return g("b");
}
let urlTimer = 0;
function writeUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const p = new URLSearchParams();
    if (S.q) p.set("q", S.q);
    if (S.group !== "category") p.set("g", S.group);
    if (S.sort !== "title") p.set("s", S.sort);
    if (S.target !== "web") p.set("t", S.target);
    if (S.author) p.set("a", S.author);
    if (S.subject) p.set("sub", S.subject);
    if (S.series) p.set("ser", S.series);
    if (S.dups) p.set("dup", "1");
    if (S.view !== "spines") p.set("v", S.view);
    if (S.pb) p.set("p", S.pb + (S.pch ? "." + S.pch : ""));
    if (S.col && S.col !== "__shared__") { p.set("c", S.col); if (S.only) p.set("only", "1"); }
    const u = location.pathname + (p.toString() ? "?" + p : "");
    if (u !== location.pathname + location.search) history.replaceState(null, "", u);
  }, 250);
}

// ---------------------------------------------------------------- grouping, sorting, filtering
function groupKey(b) {
  switch (S.group) {
    case "author": return firstAuthorLetter(b);
    case "decade": { const y = parseInt(b[4], 10); return y ? (y < 1500 ? "Before 1500" : Math.floor(y / 10) * 10 + "s") : "Undated"; }
    case "kind": return b[5] === "full" ? "Full books" : "Excerpts (first 100 pages)";
    case "series": return b[8] || "No series";
    case "lang": return LANGS[b[9]] || b[9] || "English";
    default: return b[3];
  }
}
function sorter() {
  const t = (a, b) => a[1].localeCompare(b[1], "en", { sensitivity: "base" });
  const n = (b) => (passageMap && passageMap.get(b[11])) || 0;
  switch (S.sort) {
    case "author": return (a, b) => a[2].localeCompare(b[2], "en", { sensitivity: "base" }) || t(a, b);
    case "year": return (a, b) => (parseInt(a[4], 10) || 9999) - (parseInt(b[4], 10) || 9999) || t(a, b);
    case "pages": return (a, b) => (b[6] || 0) - (a[6] || 0) || t(a, b);
    case "rel": return (a, b) => n(b) - n(a) || t(a, b);
    default: return t;
  }
}
const fold = (x) => String(x ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const OPS = { author: 2, cat: 3, category: 3, kind: 5, lang: 9, series: 8, subject: 7, title: 1 };
// "gill author:spurgeon year:1850-1900 cat:commentary kind:full lang:es" or a "quoted phrase"
function parseQuery(q) {
  const terms = [], ops = [];
  for (const m of fold(q).matchAll(/(?:(\w+):)?(?:"([^"]+)"|(\S+))/g)) {
    const key = m[1], val = m[2] || m[3];
    if (key === "year") {
      const r = /^(<|>)?(\d{3,4})(?:-(\d{3,4}))?$/.exec(val);
      if (r) { const a = +r[2], z = r[3] ? +r[3] : a; ops.push((b) => { const y = parseInt(b[4], 10); return !!y && (r[1] === "<" ? y < a : r[1] === ">" ? y > a : y >= a && y <= z); }); continue; }
    }
    if (key && OPS[key] !== undefined) { const i = OPS[key]; ops.push((b) => fold(b[i]).includes(val)); continue; }
    terms.push(key ? key + ":" + val : val);
  }
  return { terms, ops };
}
function visible() {
  const { terms, ops } = parseQuery(S.q);
  const cs = S.only && S.col ? colSet() : null;
  return BOOKS.filter((b) => {
    if (b[10] !== -1 && !S.dups) return false;
    if (cs && !cs.has(b[0])) return false;
    if (S.author && !parts(b[2]).includes(S.author)) return false;
    if (S.subject && !parts(b[7]).includes(S.subject)) return false;
    if (S.series && b[8] !== S.series) return false;
    if (S.status && (S.status === "none" ? STATUS[b[0]] : STATUS[b[0]] !== S.status)) return false;
    if (passageMap && !passageMap.has(b[11])) return false;
    if (ops.length && !ops.every((f) => f(b))) return false;
    if (terms.length) { const hay = fold(b[1] + " " + b[2] + " " + b[3] + " " + b[4] + " " + b[7] + " " + b[8]); if (!terms.every((t) => hay.includes(t))) return false; }
    return true;
  });
}

// ---------------------------------------------------------------- rendering
function spineHtml(b, pins, cnt) {
  const L = look(b), pinned = pins.has(b[0]);
  const twins = TWINS.get(b[11]);
  return `<a class="spine${b[5] === "excerpt" ? " ex" : ""}${pinned ? " pinned" : ""}${STATUS[b[0]] ? " st-" + STATUS[b[0]] : ""}" href="${esc(href(b))}" ${S.target === "details" ? "" : 'target="_blank" rel="noopener"'} data-i="${b[11]}" style="width:${L.w}px;height:${L.ht}px;background:${L.bg}" aria-label="${esc(b[1])}${b[2] ? ", " + esc(b[2]) : ""}"><span>${esc(b[1])}</span>${pinned ? '<i class="pin"></i>' : ""}${twins ? `<i class="twin">${twins + 1}x</i>` : ""}${cnt ? `<em class="cnt">${cnt}</em>` : ""}</a>`;
}
function coverHtml(b, pins, cnt) {
  const u = coverUrl(b);
  return `<a class="cover${pins.has(b[0]) ? " pinned" : ""}" href="${esc(href(b))}" ${S.target === "details" ? "" : 'target="_blank" rel="noopener"'} data-i="${b[11]}">${u ? `<img loading="lazy" src="${esc(u)}" alt="">` : `<div class="ph">${esc(b[1])}</div>`}<span>${esc(b[1])}${cnt ? ` (${cnt})` : ""}</span></a>`;
}

function render() {
  const list = visible();
  const total = BOOKS.filter((b) => b[10] === -1 || S.dups).length;
  $("count").textContent = list.length.toLocaleString() + " of " + total.toLocaleString() + " books";
  renderFilters(); renderNote();
  const pins = S.col ? colSet() : new Set();
  const groups = new Map();
  if (S.group === "col") {
    for (const name of Object.keys(COLS)) { const set = new Set(COLS[name]); const g = list.filter((b) => set.has(b[0])); if (g.length) groups.set(name, g); }
    if (S.shared) { const set = new Set(S.shared.rids); const g = list.filter((b) => set.has(b[0])); if (g.length) groups.set("Shared: " + S.shared.name, g); }
  } else {
    for (const b of list) { const k = groupKey(b); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
  }
  let keys = [...groups.keys()];
  if (S.group === "category" || S.group === "series" || S.group === "lang") keys.sort((a, b) => (a === "No series") - (b === "No series") || groups.get(b).length - groups.get(a).length);
  else if (S.group === "decade") keys.sort((a, b) => (a === "Before 1500" ? -1 : b === "Before 1500" ? 1 : a === "Undated" ? 1 : b === "Undated" ? -1 : parseInt(a) - parseInt(b)));
  else if (S.group !== "col") keys.sort();
  const avail = Math.max(260, $("shelves").clientWidth - PAD), cmp = sorter(), out = [];
  const covers = S.view === "covers" && PRIV;
  for (const k of keys) {
    const books = groups.get(k).sort(cmp);
    out.push(`<section class="group"><h2>${esc(k)} <small>${books.length.toLocaleString()}</small></h2>`);
    if (covers) {
      out.push(`<div class="covers">${books.map((b) => coverHtml(b, pins, passageMap ? passageMap.get(b[11]) : 0)).join("")}</div></section>`);
      continue;
    }
    let row = [], used = 0;
    const flush = () => { if (row.length) out.push(`<div class="row">${row.join("")}</div><div class="board"></div>`); row = []; used = 0; };
    for (const b of books) {
      const L = look(b);
      if (used + L.w + GAP > avail && row.length) flush();
      used += L.w + GAP;
      row.push(spineHtml(b, pins, passageMap ? passageMap.get(b[11]) : 0));
    }
    flush(); out.push("</section>");
  }
  $("shelves").innerHTML = out.length ? out.join("") : '<p class="empty">No books match.</p>';
  writeUrl();
}

function renderFilters() {
  const c = [];
  const chip = (label, key) => c.push(`<span class="chip">${esc(label)} <b role="button" tabindex="0" data-clear="${key}" aria-label="Remove filter">&times;</b></span>`);
  if (S.author) chip("Author: " + S.author, "author");
  if (S.subject) chip("Subject: " + S.subject, "subject");
  if (S.series) chip("Series: " + S.series, "series");
  if (S.pb) chip("Passage: " + BIBLE[S.pb - 1] + (S.pch ? " " + S.pch : ""), "passage");
  if (S.only && S.col) chip("Shelf: " + (S.col === "__shared__" ? "Shared: " + S.shared.name : S.col), "only");
  $("filters").innerHTML = c.join("");
}
function renderNote() {
  const n = $("note");
  if (S.pb && passageMap) {
    n.style.display = "block";
    n.textContent = `Books that cite ${BIBLE[S.pb - 1]}${S.pch ? " " + S.pch : ""}, most references first (number on each spine). Counts come from the exported copies, and an excerpt covers only the first 100 pages of a book, so a commentary's coverage can be understated.`;
  } else if (S.pb) { n.style.display = "block"; n.textContent = "Loading passage index..."; }
  else if (S.shared) { n.style.display = "block"; n.innerHTML = `Shared shelf "${esc(S.shared.name)}" with ${S.shared.rids.length} books. <button id="saveShared">Save to my shelves</button>`; }
  else n.style.display = "none";
}

// ---------------------------------------------------------------- passage shelf
async function loadRefs(n) {
  const key = String(n);
  if (refsCache.has(key)) return refsCache.get(key);
  const p = fetch(`data/refs/${n}.json?v=${encodeURIComponent(VER)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  refsCache.set(key, p);
  return p;
}
async function applyPassage() {
  passageMap = null;
  if (!S.pb) { if (S.sort === "rel") S.sort = "title"; syncControls(); render(); return; }
  render();
  const d = await loadRefs(S.pb);
  if (!d) { $("note").style.display = "block"; $("note").textContent = "No passage index is available for this book yet."; return; }
  const list = S.pch ? (d.chapters && d.chapters[String(S.pch)]) || [] : d.all || [];
  passageMap = new Map(list.map(([i, c]) => [i, c]));
  if (S.sort === "title") S.sort = "rel";
  syncControls(); render();
}

// ---------------------------------------------------------------- details drawer
function openDetails(i) {
  const b = BOOKS[i]; if (!b) return;
  lastDetail = i;
  const cu = coverUrl(b), du = driveUrl(b), twins = BOOKS.filter((x) => x[10] === i || (b[10] >= 0 && (x[11] === b[10] || x[10] === b[10]) && x[11] !== i));
  const chips = (arr, kind) => arr.map((v) => `<button class="chip" data-f="${kind}" data-v="${esc(v)}">${esc(v)}</button>`).join(" ");
  const inCol = S.col && S.col !== "__shared__" && (COLS[S.col] || []).includes(b[0]);
  $("dbody").innerHTML = `
    ${cu ? `<img class="cover-big" src="${esc(cu)}" alt="">` : ""}
    <h2 id="dtitle">${esc(b[1])}</h2>
    <div class="meta">${esc(b[3])}${b[4] ? " &middot; " + esc(b[4]) : ""} &middot; ${b[5] === "full" ? "full book" : "excerpt (first 100 pages)"} &middot; ${b[6] || "?"} pages exported${b[8] ? " &middot; " + esc(b[8]) : ""}</div>
    <div class="actions"><a class="btn" href="${webUrl(b[0])}" target="_blank" rel="noopener">Open in Logos (browser)</a><a class="btn" href="${appUrl(b[0])}">Open in Logos app</a>${du ? `<a class="btn" href="${esc(du)}" target="_blank" rel="noopener">PDF on Drive</a>` : ""}</div>
    ${parts(b[2]).length ? `<h3>Authors</h3><div class="chips">${chips(parts(b[2]), "author")}</div>` : ""}
    ${b[8] ? `<h3>Series</h3><div class="chips">${chips([b[8]], "series")}</div>` : ""}
    ${parts(b[7]).length ? `<h3>Subjects</h3><div class="chips">${chips(parts(b[7]), "subject")}</div>` : ""}
    ${b[9] && b[9] !== "en" ? `<h3>Language</h3><p>${esc(LANGS[b[9]] || b[9])}</p>` : ""}
    ${twins.length ? `<h3>Other copies</h3><p>${twins.map((t) => `<a href="${webUrl(t[0])}" target="_blank" rel="noopener">${esc(t[1])}</a> (${t[5]})`).join("<br>")}</p>` : ""}
    ${(() => { const au = parts(b[2])[0]; if (!au) return ""; const more = BOOKS.filter((x) => x[10] === -1 && x[11] !== i && parts(x[2]).includes(au)).slice(0, 8); return more.length ? `<h3>More by ${esc(au)}</h3><ul class="plain">${more.map((x) => `<li><a href="${esc(webUrl(x[0]))}" target="_blank" rel="noopener">${esc(x[1])}</a>${x[4] ? " (" + esc(x[4]) + ")" : ""}</li>`).join("")}</ul>` : ""; })()}
    <h3>Shelves</h3>
    <div class="actions"><button id="dpin">${S.col && S.col !== "__shared__" ? (inCol ? "Remove from " : "Add to ") + esc(S.col) : "Choose a shelf above first"}</button><button id="dlink">Copy link to this book</button></div>
    <h3>Reading status (saved in this browser)</h3>
    <select id="dstatus" aria-label="Reading status"><option value="">Not marked</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}"${STATUS[b[0]] === k ? " selected" : ""}>${v}</option>`).join("")}</select>
    <h3>Notes (saved in this browser)</h3>
    <textarea id="dnote" aria-label="Notes">${esc(NOTES[b[0]] || "")}</textarea>`;
  const dr = $("drawer"); dr.classList.add("open"); dr.setAttribute("aria-hidden", "false");
  $("dclose").focus();
  $("dstatus").addEventListener("change", (e) => { if (e.target.value) STATUS[b[0]] = e.target.value; else delete STATUS[b[0]]; store.set("lbs-status", JSON.stringify(STATUS)); render(); });
  $("dnote").addEventListener("input", (e) => { const v = e.target.value; if (v) NOTES[b[0]] = v; else delete NOTES[b[0]]; store.set("lbs-notes", JSON.stringify(NOTES)); });
  $("dpin").addEventListener("click", () => { if (S.col && S.col !== "__shared__") { togglePin(b[0]); openDetails(i); } else toast("Pick or create a shelf in the toolbar first"); });
  $("dlink").addEventListener("click", () => { copy(location.origin + location.pathname + "?b=" + encodeURIComponent(b[0])); });
  history.replaceState(null, "", location.pathname + "?b=" + encodeURIComponent(b[0]));
}
function closeDetails() { const dr = $("drawer"); dr.classList.remove("open"); dr.setAttribute("aria-hidden", "true"); writeUrl(); const el = lastDetail >= 0 && document.querySelector(`[data-i="${lastDetail}"]`); if (el) el.focus(); }
async function copy(t) { try { await navigator.clipboard.writeText(t); toast("Link copied"); } catch { toast("Could not copy; select the address bar"); } }

// ---------------------------------------------------------------- collections
function refreshCols() {
  const sel = $("col"), cur = S.col;
  const opts = ['<option value="">No shelf selected</option>'].concat(Object.keys(COLS).map((n) => `<option value="${esc(n)}">${esc(n)} (${COLS[n].length})</option>`));
  if (S.shared) opts.push(`<option value="__shared__">Shared: ${esc(S.shared.name)} (${S.shared.rids.length})</option>`);
  sel.innerHTML = opts.join(""); sel.value = cur && (COLS[cur] || cur === "__shared__") ? cur : "";
  if (sel.value !== cur) S.col = sel.value;
}
function togglePin(rid) {
  if (!S.col || S.col === "__shared__") { toast("Pick or create a shelf in the toolbar first"); return; }
  const a = COLS[S.col], i = a.indexOf(rid);
  if (i >= 0) a.splice(i, 1); else a.push(rid);
  saveCols(); refreshCols(); render();
}
function newCol() {
  const name = (prompt("Name for the new shelf (for example Sermon this Sunday)") || "").trim();
  if (!name) return;
  if (COLS[name]) { toast("That shelf already exists"); return; }
  COLS[name] = []; S.col = name; saveCols(); refreshCols(); render();
}
function renameCol() {
  if (!S.col || S.col === "__shared__") return;
  const name = (prompt("Rename shelf", S.col) || "").trim();
  if (!name || name === S.col) return;
  if (COLS[name]) { toast("That name is taken"); return; }
  COLS[name] = COLS[S.col]; delete COLS[S.col]; S.col = name; saveCols(); refreshCols(); render();
}
function delCol() {
  if (!S.col || S.col === "__shared__") return;
  if (!confirm(`Delete the shelf "${S.col}"? The books stay in the library.`)) return;
  delete COLS[S.col]; S.col = ""; S.only = false; saveCols(); refreshCols(); render();
}
function showList(title, books, hint) {
  const ridIndex = new Map(BOOKS.map((b) => [b[0], b]));
  const rows = books.map((b) => `<li><a href="${esc(webUrl(b[0]))}" target="_blank" rel="noopener">${esc(b[1])}</a>${b[2] ? ", " + esc(b[2]) : ""}${b[4] ? " (" + esc(b[4]) + ")" : ""} <button class="chip" data-detail="${b[11]}">details</button></li>`).join("");
  $("dbody").innerHTML = `<h2 id="dtitle">${esc(title)}</h2>${hint ? `<p>${esc(hint)}</p>` : ""}${rows ? `<ol class="plain">${rows}</ol>` : "<p>Nothing here yet.</p>"}`;
  const dr = $("drawer"); dr.classList.add("open"); dr.setAttribute("aria-hidden", "false"); $("dclose").focus();
  $("dbody").querySelectorAll("[data-detail]").forEach((el) => el.addEventListener("click", () => openDetails(+el.dataset.detail)));
  return ridIndex;
}
function showRecent() {
  const m = new Map(BOOKS.map((b) => [b[0], b]));
  showList("Recently opened", RECENT.map((r) => m.get(r)).filter(Boolean), "Books you opened from this page, newest first. Stored only in this browser.");
}
function surprise() {
  const pool = visible().filter((b) => !STATUS[b[0]]);
  if (!pool.length) { toast("No unmarked books in this view"); return; }
  openDetails(pool[Math.floor(Math.random() * pool.length)][11]);
}
function shelfMarkdown() {
  if (!S.col || S.col === "__shared__") { toast("Pick one of your shelves first"); return; }
  const m = new Map(BOOKS.map((b) => [b[0], b]));
  const md = `# ${S.col}\n\n` + COLS[S.col].map((r) => m.get(r)).filter(Boolean).map((b) => `- [${b[1]}](${webUrl(b[0])})${b[2] ? " - " + b[2] : ""}${b[4] ? " (" + b[4] + ")" : ""}`).join("\n") + "\n";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
  a.download = S.col.replace(/[^\w -]+/g, "_") + ".md"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCols() {
  const blob = new Blob([JSON.stringify({ shelves: COLS, notes: NOTES }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "logos-bookshelf-shelves.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importCols(file) {
  const r = new FileReader();
  r.onload = () => { const d = json(r.result, null); if (!d || typeof d !== "object") { toast("Not a shelves file"); return; }
    const sh = d.shelves || d; let n = 0;
    for (const k of Object.keys(sh)) if (Array.isArray(sh[k])) { COLS[k] = [...new Set([...(COLS[k] || []), ...sh[k]])]; n++; }
    if (d.notes) Object.assign(NOTES, d.notes), store.set("lbs-notes", JSON.stringify(NOTES));
    saveCols(); refreshCols(); render(); toast(`Imported ${n} shelves`); };
  r.readAsText(file);
}
function shareCol() {
  if (!S.col || S.col === "__shared__") { toast("Pick one of your shelves first"); return; }
  const rids = COLS[S.col]; if (!rids.length) { toast("That shelf is empty"); return; }
  copy(location.origin + location.pathname + "?share=" + encodeURIComponent(S.col) + "~" + rids.map(encodeURIComponent).join(","));
}

// ---------------------------------------------------------------- stats
function showStats() {
  const bs = BOOKS.filter((b) => b[10] === -1);
  const cnt = (f) => { const m = new Map(); for (const b of bs) for (const k of [].concat(f(b))) if (k) m.set(k, (m.get(k) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const bars = (rows, max) => { const m = max || (rows[0] ? rows[0][1] : 1); return `<div class="bars">${rows.map(([k, v]) => `<span>${esc(k)}</span><i style="width:${Math.max(2, (v / m) * 100)}%"></i><b>${v.toLocaleString()}</b>`).join("")}</div>`; };
  const pages = bs.reduce((s, b) => s + (b[6] || 0), 0), full = bs.filter((b) => b[5] === "full").length;
  const cent = new Map(); for (const b of bs) { const y = parseInt(b[4], 10); if (y) { const k = y < 1500 ? "Before 1500" : Math.floor(y / 100) * 100 + "s"; cent.set(k, (cent.get(k) || 0) + 1); } }
  const centRows = [...cent.entries()].sort((a, b) => (a[0] === "Before 1500" ? -1 : b[0] === "Before 1500" ? 1 : parseInt(a[0]) - parseInt(b[0])));
  $("sbody").innerHTML = `<div class="stats-grid"><div class="stat"><b>${bs.length.toLocaleString()}</b>distinct books</div><div class="stat"><b>${full.toLocaleString()}</b>full books</div><div class="stat"><b>${(bs.length - full).toLocaleString()}</b>excerpts</div><div class="stat"><b>${pages.toLocaleString()}</b>pages exported</div><div class="stat"><b>${(BOOKS.length - bs.length).toLocaleString()}</b>duplicate copies hidden</div>${Object.keys(STATUS).length ? `<div class="stat"><b>${bs.filter((b) => STATUS[b[0]] === "read").length}</b>marked read</div><div class="stat"><b>${bs.filter((b) => STATUS[b[0]] === "reading").length}</b>reading</div><div class="stat"><b>${bs.filter((b) => STATUS[b[0]] === "want").length}</b>want to read</div>` : ""}</div>
   <h3>By category</h3>${bars(cnt((b) => b[3]).slice(0, 16))}
   <h3>By century of the edition</h3>${bars(centRows)}
   <h3>Most books by author</h3>${bars(cnt((b) => parts(b[2])).filter(([k]) => !/^(Edited|Various)/i.test(k)).slice(0, 15))}
   ${bs.some((b) => b[8]) ? `<h3>Largest series</h3>${bars(cnt((b) => b[8]).slice(0, 12))}` : ""}
   <h3>Languages</h3>${bars(cnt((b) => LANGS[b[9]] || "English"))}`;
  openModal("stats");
}
function openModal(id) { $(id).classList.add("open"); $(id).querySelector("button.x").focus(); }
function closeModal(id) { $(id).classList.remove("open"); }

// ---------------------------------------------------------------- controls
function syncControls() {
  for (const [id, key] of [["group", "group"], ["sort", "sort"], ["target", "target"]]) { if ($(id).value !== S[key]) $(id).value = S[key]; }
  $("q").value = S.q; $("dups").checked = S.dups;
  $("pbook").value = S.pb || ""; fillChapters(); $("pch").value = S.pch || "";
  $("edit").classList.toggle("on", S.edit); $("edit").setAttribute("aria-pressed", String(S.edit));
  $("vwrap").style.display = PRIV ? "" : "none"; $("view").value = S.view;
  refreshCols();
}
function fillChapters() {
  const sel = $("pch");
  if (!S.pb) { sel.style.display = "none"; return; }
  sel.style.display = "";
  const n = CHAPTERS[S.pb - 1];
  sel.innerHTML = '<option value="">Whole book</option>' + Array.from({ length: n }, (_, i) => `<option value="${i + 1}">Chapter ${i + 1}</option>`).join("");
}
function retarget() { document.querySelectorAll("a.spine,a.cover").forEach((a) => { const b = BOOKS[+a.dataset.i]; a.href = href(b); if (S.target === "details") a.removeAttribute("target"); else { a.target = "_blank"; a.rel = "noopener"; } }); }

const tip = $("tip");
function showTip(e) {
  const a = e.target.closest("a.spine,a.cover");
  if (!a) { tip.style.display = "none"; return; }
  const b = BOOKS[+a.dataset.i], cu = coverUrl(b);
  tip.innerHTML = `${cu ? `<img src="${esc(cu)}" alt="">` : ""}<b>${esc(b[1])}</b>${esc(b[2] || "Unknown author")}<br><i>${esc(b[3])}${b[4] ? " &middot; " + esc(b[4]) : ""} &middot; ${b[5] === "full" ? "full book" : "excerpt"}${b[8] ? " &middot; " + esc(b[8]) : ""}</i>`;
  tip.style.display = "block";
  const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 18, innerHeight - tip.offsetHeight - 8);
  tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
}

function wire() {
  const sh = $("shelves");
  sh.addEventListener("mousemove", showTip);
  sh.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  sh.addEventListener("click", (e) => {
    const a = e.target.closest("a.spine,a.cover"); if (!a) return;
    const i = +a.dataset.i;
    if (e.shiftKey || S.target === "details") { e.preventDefault(); openDetails(i); return; }
    if (S.edit) { e.preventDefault(); togglePin(BOOKS[i][0]); return; }
    noteOpened(BOOKS[i][0]);
  });
  sh.addEventListener("contextmenu", (e) => { const a = e.target.closest("a.spine,a.cover"); if (!a) return; e.preventDefault(); openDetails(+a.dataset.i); });
  sh.addEventListener("keydown", (e) => {
    const a = e.target.closest("a.spine,a.cover"); if (!a) return; const i = +a.dataset.i;
    if (e.key === "i") { e.preventDefault(); openDetails(i); } else if (e.key === "p") { e.preventDefault(); togglePin(BOOKS[i][0]); }
  });
  $("filters").addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.clear; if (!k) return;
    if (k === "passage") { S.pb = 0; S.pch = 0; applyPassage(); return; }
    if (k === "only") S.only = false; else S[k] = "";
    syncControls(); render();
  });
  $("note").addEventListener("click", (e) => { if (e.target.id === "saveShared" && S.shared) { COLS[S.shared.name] = [...new Set([...(COLS[S.shared.name] || []), ...S.shared.rids])]; S.col = S.shared.name; S.shared = null; saveCols(); refreshCols(); render(); toast("Saved to your shelves"); } });
  let t; $("q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { S.q = e.target.value; render(); }, 150); });
  $("group").addEventListener("change", (e) => { S.group = e.target.value; store.set("lbs-group", S.group); render(); });
  $("sort").addEventListener("change", (e) => { S.sort = e.target.value; store.set("lbs-sort", S.sort); render(); });
  $("target").addEventListener("change", (e) => { S.target = e.target.value; store.set("lbs-target", S.target); retarget(); writeUrl(); });
  $("view").addEventListener("change", (e) => { S.view = e.target.value; render(); });
  $("recent").addEventListener("click", showRecent); $("surprise").addEventListener("click", surprise); $("expmd").addEventListener("click", shelfMarkdown);
  $("status").addEventListener("change", (e) => { S.status = e.target.value; render(); });
  $("dups").addEventListener("change", (e) => { S.dups = e.target.checked; render(); });
  $("pbook").addEventListener("change", (e) => { S.pb = +e.target.value || 0; S.pch = 0; fillChapters(); applyPassage(); });
  $("pch").addEventListener("change", (e) => { S.pch = +e.target.value || 0; applyPassage(); });
  $("col").addEventListener("change", (e) => { S.col = e.target.value; if (!S.col) S.only = false; render(); });
  $("only").addEventListener("click", () => { if (!S.col) { toast("Pick a shelf first"); return; } S.only = !S.only; render(); });
  $("edit").addEventListener("click", () => { S.edit = !S.edit; syncControls(); toast(S.edit ? "Pin mode: click books to add or remove them" : "Pin mode off"); });
  $("newcol").addEventListener("click", newCol); $("rencol").addEventListener("click", renameCol); $("delcol").addEventListener("click", delCol);
  $("expcol").addEventListener("click", exportCols); $("sharecol").addEventListener("click", shareCol);
  $("impcol").addEventListener("click", () => $("impfile").click());
  $("impfile").addEventListener("change", (e) => { if (e.target.files[0]) importCols(e.target.files[0]); e.target.value = ""; });
  $("statsbtn").addEventListener("click", showStats);
  $("dclose").addEventListener("click", closeDetails);
  $("drawer").addEventListener("click", (e) => { const b = e.target.closest("button[data-f]"); if (!b) return; const k = b.dataset.f; S[k] = b.dataset.v; closeDetails(); syncControls(); render(); window.scrollTo({ top: 0 }); });
  document.querySelectorAll(".modal").forEach((m) => { m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); }); m.querySelector("button.x").addEventListener("click", () => closeModal(m.id)); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if ($("drawer").classList.contains("open")) closeDetails(); document.querySelectorAll(".modal.open").forEach((m) => closeModal(m.id)); }
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $("q").focus(); }
  });
  let rw = 0; addEventListener("resize", () => { clearTimeout(rw); rw = setTimeout(render, 200); });
  $("pbook").innerHTML = '<option value="">Find books on a passage</option>' + BIBLE.map((n, i) => `<option value="${i + 1}">${n}</option>`).join("");
}

// ---------------------------------------------------------------- start
async function boot() {
  wire();
  S.group = store.get("lbs-group", S.group); S.sort = store.get("lbs-sort", S.sort); S.target = store.get("lbs-target", S.target);
  const bid = readUrl();
  try { BOOKS = await (await fetch("data/books.json")).json(); }
  catch { $("shelves").innerHTML = '<p class="empty">Could not load data/books.json.</p>'; return; }
  try { const m = await (await fetch("data/meta.json")).json(); VER = String(m.version || BOOKS.length); } catch { VER = String(BOOKS.length); }
  BOOKS.forEach((b, i) => { while (b.length < 11) b.push(b.length === 7 ? "" : b.length === 8 ? "" : b.length === 9 ? "en" : -1); b[11] = i; });
  const counts = new Map(); BOOKS.forEach((b) => counts.set(b[3], (counts.get(b[3]) || 0) + 1));
  CATS = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  BOOKS.forEach((b) => { if (b[10] >= 0) TWINS.set(b[10], (TWINS.get(b[10]) || 0) + 1); });
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).get("private") === "1") {
    try { const r = await fetch("data/private.json"); if (r.ok) PRIV = await r.json(); } catch { /* public build */ }
  }
  if (!PRIV) S.view = "spines";
  syncControls();
  if (S.pb) { await applyPassage(); } else render();
  if (bid) { const i = BOOKS.findIndex((b) => b[0] === bid); if (i >= 0) openDetails(i); }
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
