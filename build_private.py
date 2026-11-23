"""Build the PRIVATE data layer for the local bookshelf (never commit or publish the output).

Writes:
  data/covers/<sha1(rid)[:12]>.jpg   small cover thumbnails (about 120x180) read from the Logos catalog
  data/private.json                  {rid: {"pdf": "<Drive file id>", "cover": "covers/<file>.jpg"}}

Sources (read only):
  - Logos catalog, table Images (JPEG thumbnails Logos already keeps in its own unencrypted catalog database)
  - logos-research/library.db, table books (rid, pdf_id)

Usage: python build_private.py [library.db] [catalog.db]
Requires Pillow. Covers are the publishers' artwork: keep them local, never push them.
"""
import glob, hashlib, io, json, os, sqlite3, sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LIB = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("LIBRARY_DB", "library.db")
if len(sys.argv) > 2:
    CAT = sys.argv[2]
else:
    found = glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Logos\Data\*\LibraryCatalog\catalog.db"))
    if not found:
        sys.exit("Logos catalog.db not found; pass its path as the second argument")
    CAT = found[0]

OUT = os.path.join(HERE, "data", "covers")
os.makedirs(OUT, exist_ok=True)

# read-only, immutable: never writes to or locks the Logos files
cat = sqlite3.connect(f"file:{CAT.replace(os.sep, '/')}?mode=ro&immutable=1", uri=True)
lib = sqlite3.connect(f"file:{LIB.replace(os.sep, '/')}?mode=ro", uri=True)

covers = {}
for rid, blob in cat.execute("select r.ResourceId, i.Image from Images i join Records r on r.RecordId = i.RecordId where i.Image is not null and length(i.Image) > 200"):
    covers.setdefault(rid, bytes(blob))

priv, n_cover, total_bytes, skipped = {}, 0, 0, 0
for rid, pdf in lib.execute("select rid, pdf_id from books where rid is not null and rid != ''"):
    entry = {"pdf": pdf or "", "cover": ""}
    blob = covers.get(rid)
    if blob:
        try:
            im = Image.open(io.BytesIO(blob)).convert("RGB")
            im.thumbnail((120, 180), Image.LANCZOS)
            name = hashlib.sha1(rid.encode("utf8")).hexdigest()[:12] + ".jpg"
            path = os.path.join(OUT, name)
            im.save(path, "JPEG", quality=70, optimize=True)
            entry["cover"] = "covers/" + name
            n_cover += 1
            total_bytes += os.path.getsize(path)
        except Exception:
            skipped += 1
    priv[rid] = entry

with open(os.path.join(HERE, "data", "private.json"), "w", encoding="utf8") as f:
    json.dump(priv, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(priv)} books, {n_cover} covers ({total_bytes / 1e6:.1f} MB), {skipped} unreadable images, {sum(1 for v in priv.values() if v['pdf'])} with a Drive PDF id")
