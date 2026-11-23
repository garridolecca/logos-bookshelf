# Private data layer (local only)

The public site on GitHub Pages shows titles, authors, categories and years only. A local copy can add real book covers and a link to each book's PDF copy on Drive. These extras come from two files that must never be committed or published:

- `data/private.json` holds, for each Logos ID, the Google Drive file id of the PDF and the path of the cover image. It is in `.gitignore`.
- `data/covers/` holds small JPEG covers (about 120 by 180 pixels, 17.5 MB for 4,867 books). They are the publishers' artwork, read from the thumbnails Logos already keeps in its own catalog database (`%LOCALAPPDATA%\Logos\Data\<id>\LibraryCatalog\catalog.db`, table `Images`). Do not commit, publish or share them. It is in `.gitignore`.

## Rebuild

```
python build_private.py
```

The script opens the Logos catalog and `logos-research\library.db` read only, so it never changes or locks Logos files. It needs Pillow (`pip install pillow`). Optional arguments: path to `library.db`, then path to `catalog.db`.

## Run the private version

```
python -m http.server 5180
```

Open http://localhost:5180/ from this folder. The app loads `data/private.json` if it exists and shows the extras. On the public site the file is missing, so the covers and PDF links are simply hidden.

## Before every push

Run `git status` and check that neither `data/private.json` nor anything under `data/covers/` is listed. `git check-ignore -v data/private.json` should print the `.gitignore` rule.
