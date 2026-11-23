"""Export the library list for the bookshelf app: rid, title, authors, category, year, kind, pages.
No Drive links, citations or file paths. Source: logos-research/library.db (read only)."""
import json, sqlite3, sys
db = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\rdpuser\ClaudeProject\logos-research\library.db"
c = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
rows = c.execute("select rid,title,authors,category,year,kind,npages from books where rid is not null and rid != '' order by title").fetchall()
out = [[r[0], r[1] or "", r[2] or "", r[3] or "Other", r[4] or "", r[5] or "", int(r[6] or 0)] for r in rows]
json.dump(out, open("data/books.json", "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print(len(out), "books")
