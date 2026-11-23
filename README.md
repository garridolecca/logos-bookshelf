# Logos Bookshelf

A visual bookshelf of a personal Logos Bible Software library. Every book is a spine on a wooden shelf; click a spine to open that book in Logos.

**Live:** https://garridolecca.github.io/logos-bookshelf/

## What it does

- **Open in Logos:** a click opens the book in Logos in the browser (`app.logos.com`) or in the desktop app (`logosres:`). A third setting opens a details panel instead, which suits touch screens.
- **Find books on a passage:** pick a Bible book and chapter and the shelf shows the books that cite it, most references first, with the count on each spine. Counts are page-level Scripture references in the exported copies; an excerpt covers only the first 100 pages, so a commentary's coverage can be understated.
- **My shelves:** create collections such as "Sermon this Sunday". Turn on Pin mode and click books to add or remove them (or press `p` on a focused book). Export, import, or share a shelf as a link. Shelves and notes stay in your browser.
- **Details panel:** Shift+click, right-click, or press `i` on a book. Authors, subjects and series are links that filter the shelf. Add a private note, copy a link to the book, see other copies.
- **Shelve by** category, series (111 series detected), author (A to Z), decade, language, full versus excerpt, or your own shelves. Sort by title, author, year, thickness, or passage references.
- **Search** across title, author, category, year, subject and series. Press `/` to focus the search box.
- **Search operators:** combine words with `author:` `cat:` `kind:full|excerpt` `lang:` `series:` `subject:` `title:` and `year:1850`, `year:1600-1700` or `year:<1700` (for example `gill author:spurgeon cat:commentary`). Matching ignores accents and capitals; use quotes for a phrase. Years are the catalogued publication year, often of a modern reprint.
- **Reading status:** mark a book Read, Reading or Want to read in its details panel, then filter by status. Stored only in your browser.
- **Recent and Surprise me:** a list of the books you opened from the page, and a random unmarked book from the current view.
- **More by this author** in the details panel, and **Markdown** export of a shelf as a list of links.
- **Library stats:** counts by category, century, author, series and language.
- **Duplicates** (the same resource listed twice) are hidden by default and flagged with a small badge.
- **Shareable views:** the address holds the search, grouping, passage and shelf. `?b=<id>` opens a book's details.
- **Offline and installable:** a service worker caches the page, the book list, and each passage index after first use; it can be installed from the browser.

Spine thickness follows the page count of the exported copy; a dotted top edge marks an excerpt. You need to be signed in to Logos for a book to open. The public page lists titles, authors, categories, years, subjects, series and Scripture-reference counts only; it holds no book text, no files and no account information.

This is an unofficial personal project and is not affiliated with Logos or Faithlife.

## Private version (covers and Drive PDFs)

Book covers are the publishers' artwork and a Drive link is personal, so neither is in this repository. `PRIVATE.md` explains the local-only version, which adds a Covers view and a "PDF on Drive" button when `data/private.json` and `data/covers/` exist (both are git-ignored).

## Rebuild the data

`python build_data.py [path\to\library.db]` reads a local database with `books` and `refs` tables and writes `data/books.json`, `data/meta.json` and `data/refs/<n>.json`. Books without a Logos ID are skipped.

## License

MIT
