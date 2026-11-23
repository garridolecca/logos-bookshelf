"""Export the library data for the bookshelf app from a local Logos library database (read only).

python build_data.py [path\\to\\library.db]

Writes (all under data/, deterministic, nothing personal: no Drive links, file paths or citations):
  data/books.json   [rid, title, authors, category, year, kind, pages, subjects, series, lang, dupOf] per book
  data/meta.json    version, count, series and language counts
  data/refs/<n>.json  for Bible book n = 1..66: which library books treat which chapter, by page-level reference count

Books without a Logos ID are skipped. dupOf is the index (in books.json) of the preferred copy when a book is a
duplicate of another, otherwise -1.
"""
import collections, datetime, json, os, re, sqlite3, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
DB = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LIBRARY_DB", "library.db")
QC = os.environ.get("QC_RESULTS", "")   # optional: page-hash groups from a PDF check (JSON lines)
OUT = os.path.join(HERE, "data")

BIBLE = ["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
         "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
         "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
         "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
         "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
         "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
         "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation"]

# ---- series from the Logos resource id prefix (only where the series is certain from the titles and authors) ----
SERIES_BY_PREFIX = {
    "BST": "The Bible Speaks Today", "BSTUS": "The Bible Speaks Today",
    "REC": "Reformed Expository Commentary", "EEC": "Evangelical Exegetical Commentary",
    "HNTC": "Holman New Testament Commentary", "NICNT": "New International Commentary on the New Testament",
    "ICC_": "International Critical Commentary", "ICC_MT": "International Critical Commentary",
    "CAMBC": "Cambridge Bible for Schools and Colleges", "EXGSUM": "Exegetical Summary",
    "BARNES": "Barnes' Notes on the Bible", "CALCOM": "Calvin's Commentaries", "LBG": "Lexham Bible Guide",
    "VBV": "Verse by Verse (Osborne)", "TRNSWRD": "Transformative Word", "TTCSGNT": "T&T Clark Study Guides to the New Testament",
    "SPRGNCOMM": "Spurgeon Commentary", "EBTC": "Evangelical Biblical Theology Commentary",
    "MTPSERMS": "Metropolitan Tabernacle Pulpit", "NPSPSERMS": "New Park Street Pulpit",
    "EXGRKTST": "The Expositor's Greek Testament", "TREASDAVD": "The Treasury of David",
    "WRLDGRTSERM": "The World's Great Sermons", "PURSERMONS": "Puritan Sermons",
    "MOFFATCMM": "Moffatt New Testament Commentary", "SAS": "Study, Apply, Share",
}
GENERIC = {"commentary", "commentaries", "introduction", "works", "sermons", "journal", "bible", "history", "selected works"}


def key(s):
    s = unicodedata.normalize("NFKD", (s or "").lower().replace("&", " and "))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", "", s)


def strip_volume(t):
    t = re.sub(r"\s*\((?:19|20|18|17)\d\d\)\s*(?:Volumes?|Vol\.?).*$", "", t, flags=re.I)        # Bible and Spade (1990) Volume 3
    t = re.sub(r",\s*(?:18|19|20)\d\d\s*,.*$", "", t)                                              # Princeton Review, 1924, Vol. 2
    t = re.sub(r"[,:]?\s*(?:Volumes?|Vols?\.?)\s*[\w\u2013\u2014\-&., ]*(?::.*)?$", "", t, flags=re.I)  # ..., Volume 12: subtitle
    t = re.sub(r":\s*(?:18|19|20)\d\d$", "", t)                                                    # The Sword and Trowel: 1865
    t = re.sub(r"\s*\(\s*(?:Complete|Part)[^)]*\)\s*$", "", t, flags=re.I)
    return t.strip(" ,:;")


def clean_subjects(s):
    out, seen = [], set()
    for item in (s or "").split(";"):
        item = item.strip().rstrip(".")
        if not item:
            continue
        head, *tail = [p.strip() for p in item.split("--")]
        head = re.sub(r"^Bible\.\s*(?:O\.T\.|N\.T\.)?\s*", "", head).strip() or "Bible"
        tail = [p for p in tail if p.lower() not in {
            "commentaries", "criticism, interpretation, etc", "periodicals", "sermons", "introductions", "outlines, syllabi, etc",
            "study and teaching", "criticism and interpretation", "versions", "english", "textbooks"}]
        item = "--".join([head] + tail)
        if head == "Bible" and not tail:
            item = "Bible"
        k = item.lower()
        if k not in seen and not k.startswith("education--"):
            seen.add(k); out.append(item)
    res = []
    for item in out:
        if len("; ".join(res + [item])) > 120:
            break
        res.append(item)
    return "; ".join(res)


def language(title, category, subjects):
    """Language of the resource's own text (not the language it is about): an English lexicon of Greek is "en"."""
    t = title or ""
    if re.search(r"erkl\w*rt von", t, re.I):
        return "de"                                                    # German commentaries on Latin authors
    if re.search(r"\(English\)|and English", t):
        return "en"
    if re.search(r"[Ͱ-Ͽἀ-῿]", t):
        return "grc"
    if re.search(r"[֐-׿]", t):
        return "he"
    for rx, code in ((r"\((Greek)\)|Greek Text", "grc"), (r"\((Latin)\)|Latin Text", "la"), (r"\((Hebrew)\)|Hebrew Text", "he"),
                     (r"\((Syriac)\)", "syr"), (r"\((Coptic)\)", "cop"), (r"\((Arabic)\)", "ar"), (r"\((Aramaic)\)", "arc"),
                     (r"\((German)\)", "de"), (r"\((French)\)", "fr"), (r"\((Spanish)\)", "es")):
        if re.search(rx, t, re.I):
            return code
    if category in ("Bible", "Critical apparatus"):                    # original-language editions, interlinears, apparatus
        for rx, code in ((r"Greek|Septuagint|Textus Receptus|Novum Testamentum|Westcott", "grc"), (r"Hebrew|Hebraica", "he"),
                         (r"Latin|Vulgate", "la"), (r"Reina Valera|Biblia", "es")):
            if re.search(rx, t) and not re.search(r"English (Septuagint|Standard|Bible)", t):
                return code
    if re.search(r"Classics--Greek", subjects or "") and "Classics--English" not in (subjects or ""):
        return "grc"
    if re.search(r"Classics--Latin", subjects or "") and "Classics--English" not in (subjects or ""):
        return "la"
    if category == "Ancient text (original language)":
        if re.search(r"Bibliotheca Historica|Apostolic Fathers|Apocryphal Gospels|Old Testament in Greek", t):
            return "grc"
        if re.search(r"Suetonius|Historiae Augustae|Livy|Cicero|Tacitus|Ab urbe", t):
            return "la"
        return "other"
    return "en"


def main():
    c = sqlite3.connect("file:%s?mode=ro" % DB.replace("\\", "/"), uri=True)
    rows = c.execute("select id,rid,title,authors,category,year,kind,npages,subjects from books "
                     "where rid is not null and rid != '' order by title").fetchall()
    n = len(rows)
    idx_by_id = {r[0]: i for i, r in enumerate(rows)}

    # ---- series ----
    prefix = lambda rid: (re.match(r"LLS:([A-Za-z_]+?)(?=\d|$)", rid) or [None, ""])[1]
    series = [""] * n
    stripped = [None] * n
    for i, (_id, rid, title, authors, cat, year, kind, npages, subj) in enumerate(rows):
        p = prefix(rid)
        if p in SERIES_BY_PREFIX:
            series[i] = SERIES_BY_PREFIX[p]
            continue
        if cat.startswith("Ancient text") or cat in ("Bible", "Study Bible"):
            continue
        stripped[i] = strip_volume(title)
    groups = collections.defaultdict(list)
    for i, s in enumerate(stripped):
        if s and len(key(s)) >= 8 and key(s) not in GENERIC:
            groups[key(s)].append(i)
    for k, members in groups.items():
        cats = {rows[i][4] for i in members}
        periodical = cats <= {"Journal", "Magazine"}
        need = 2 if periodical else 3
        if not periodical:
            # a set of volumes by one author: most members share the first author and at least two carry a volume marker
            firsts = collections.Counter(key((rows[i][3] or "").split(";")[0]) for i in members)
            if firsts.most_common(1)[0][1] < 0.7 * len(members):
                continue
            if sum(1 for i in members if stripped[i] != rows[i][2]) < 2:
                continue
        if len(members) >= need:
            name = collections.Counter(stripped[i] for i in members).most_common(1)[0][0]
            for i in members:
                series[i] = name

    # ---- language, subjects ----
    langs = [language(r[2], r[4], r[8]) for r in rows]
    subjects = [clean_subjects(r[8]) for r in rows]

    # ---- duplicates: same title, authors, year, category and kind; prefer full over excerpt, then more pages ----
    dup = [-1] * n
    by = collections.defaultdict(list)
    for i, r in enumerate(rows):
        by[(key(r[2]), key(r[3]), r[5] or "", r[4], r[6])].append(i)
    qc_pairs = 0
    for members in by.values():
        if len(members) > 1:
            best = sorted(members, key=lambda i: (rows[i][6] != "full", -(rows[i][7] or 0), i))[0]
            for i in members:
                # the same Logos resource listed twice is always a duplicate; different resources only when the page counts agree
                same = rows[i][1] == rows[best][1]
                close = abs((rows[i][7] or 0) - (rows[best][7] or 0)) <= 0.05 * max(rows[best][7] or 1, 1)
                if i != best and (same or close):
                    dup[i] = best
    # page-hash groups from the PDF check: only count two different library books with identical page hashes
    if os.path.exists(QC):
        title_idx = collections.defaultdict(list)
        for i, r in enumerate(rows):
            title_idx[key(r[2])].append(i)
        hg = collections.defaultdict(set)
        for line in open(QC, encoding="utf8"):
            try:
                q = json.loads(line)
            except ValueError:
                continue
            hs = q.get("hashes")
            if isinstance(hs, str):
                try:
                    hs = json.loads(hs.replace("'", '"'))
                except ValueError:
                    hs = None
            if hs and len(hs) >= 3 and key(q.get("title")) in title_idx:
                hg[tuple(hs)].update(title_idx[key(q["title"])])
        for members in hg.values():
            if len(members) > 1 and len({key(rows[i][2]) for i in members}) > 1 and len({rows[i][6] for i in members}) == 1:
                best = sorted(members, key=lambda i: (rows[i][6] != "full", -(rows[i][7] or 0), i))[0]
                for i in members:
                    if i != best and dup[i] == -1:
                        dup[i] = best; qc_pairs += 1

    os.makedirs(os.path.join(OUT, "refs"), exist_ok=True)
    books = [[r[1], r[2] or "", r[3] or "", r[4] or "Other", r[5] or "", r[6] or "", int(r[7] or 0),
              subjects[i], series[i], langs[i], dup[i]] for i, r in enumerate(rows)]
    with open(os.path.join(OUT, "books.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(books, f, ensure_ascii=False, separators=(",", ":"))

    # ---- Scripture reference index ----
    skip_cat = {"Bible", "Study Bible"}
    agg = collections.defaultdict(lambda: collections.defaultdict(lambda: collections.defaultdict(int)))   # bible -> chapter -> idx -> n
    q = ("select r.book, r.chapter, p.c2, count(*) from refs r join pages_content p on p.id = r.page_rowid "
         "where r.book between 1 and 66 group by r.book, r.chapter, p.c2")
    for bb, ch, bid, cnt in c.execute(q):
        i = idx_by_id.get(bid)
        if i is None or rows[i][4] in skip_cat:
            continue
        agg[bb][ch][i] += cnt
    def top(d, cap):
        items = sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))
        multi = [kv for kv in items if kv[1] >= 2]
        keep = multi if len(multi) >= 10 else items[:10]
        return [[i, k] for i, k in keep[:cap]]
    for f in os.listdir(os.path.join(OUT, "refs")):
        os.remove(os.path.join(OUT, "refs", f))
    refs_bytes = 0
    for bb in range(1, 67):
        if bb not in agg:
            continue
        allc = collections.defaultdict(int)
        chapters = {}
        for ch, d in agg[bb].items():
            for i, k in d.items():
                allc[i] += k
            if ch > 0:
                chapters[str(ch)] = top(d, 60)
        doc = {"book": bb, "name": BIBLE[bb - 1], "chapters": dict(sorted(chapters.items(), key=lambda kv: int(kv[0]))), "all": top(allc, 200)}
        p = os.path.join(OUT, "refs", "%d.json" % bb)
        with open(p, "w", encoding="utf8", newline="\n") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        refs_bytes += os.path.getsize(p)

    sc = collections.Counter(s for s in series if s)
    lc = collections.Counter(langs)
    version = datetime.datetime.fromtimestamp(os.path.getmtime(DB)).strftime("%Y%m%d")
    meta = {"version": version, "count": n, "series": [[k, v] for k, v in sorted(sc.items(), key=lambda kv: (-kv[1], kv[0]))],
            "langs": [[k, v] for k, v in sorted(lc.items(), key=lambda kv: (-kv[1], kv[0]))]}
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf8", newline="\n") as f:
        json.dump(meta, f, ensure_ascii=False, separators=(",", ":"))
    print("books", n, "| with series", sum(1 for s in series if s), "in", len(sc), "series | dups", sum(1 for d in dup if d != -1),
          "(page-hash only: %d)" % qc_pairs, "| refs files", len(os.listdir(os.path.join(OUT, "refs"))), "bytes", refs_bytes)


if __name__ == "__main__":
    main()
