# Logos Bookshelf

A visual bookshelf of a personal Logos Bible Software library. Every book is a spine on a wooden shelf; click a spine to open that book in Logos.

**Live:** https://garridolecca.github.io/logos-bookshelf/

- Shelve by category, author (A to Z), decade, or full book versus excerpt.
- Sort within a shelf by title, author, year, or thickness (number of pages).
- Search by title, author, category or year.
- Choose where a click opens: Logos in the browser (`app.logos.com`) or the Logos desktop app (`logosres:` link).
- Spine thickness follows the page count of the exported copy; a dotted top edge marks an excerpt (first 100 pages) rather than a full book.

You need to be signed in to Logos for a book to open. The page lists titles, authors, categories and years only; it holds no book text, no files and no account information.

This is an unofficial personal project and is not affiliated with Logos or Faithlife.

## Rebuild the data

`python build_data.py [path\to\library.db]` reads a local database with a `books` table (rid, title, authors, category, year, kind, npages) and writes `data/books.json`. Books without a Logos ID are skipped.

## License

MIT
