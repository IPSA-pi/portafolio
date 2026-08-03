# Artwork metadata sidecars

One JSON file per notebook, named after the notebook's folder under
`src/lib/assets/drawings/`. These files are the **source of truth** for the
gallery-metadata columns on the `drawings` table — `title`, `year`, `medium`,
`width_cm`, `height_cm` — which back the lightbox tombstone caption, image alt
text, and the purchase-confirmation emails.

Every column is nullable. With no sidecar (or an empty one) the site renders
exactly as it did before this existed: the slug is the display fallback.

## Format

```json
{
    "defaults": {
        "year": 2026,
        "medium": "Ballpoint pen on paper",
        "width_cm": 7.6,
        "height_cm": 12.7
    },
    "drawings": {
        "negro_1_03": { "title": "Anemone", "year": 2024 }
    }
}
```

- `defaults` applies to every drawing in the notebook.
- `drawings` is keyed by full drawing slug (`<notebook>_<NN>`); its keys
  override `defaults` per drawing.
- **`title` is per-drawing only.** A `title` in `defaults` is ignored — one
  title shared across a whole notebook is never what you want.
- Omit a key rather than writing `null`. Both produce `NULL` in the DB, but
  omitting reads as "not known yet".
- `medium` ships **verbatim** — the capitalisation here is what appears on the
  site.

## Notebooks

Create one file per folder under `src/lib/assets/drawings/`. Today:

- `260619.json`
- `negro_1.json`

`260619` is a `yymmdd` folder name, so its year is known (2026). `negro_1`
predates that convention and its year is still unknown — the key is simply
absent until the owner fills it in.

## Provenance (reference for new sidecars)

All drawings so far are made in **Mead 60-page memo notebooks**, roughly
**3 × 5 in portrait (≈ 7.6 × 12.7 cm)**, drawn with a **Bic Round Stic
ballpoint pen**. That's where the default `medium` / `width_cm` / `height_cm`
values come from. The brand and pen model are recorded here rather than in the
tombstone, which stays short: `year · medium · dimensions`.

## How these reach the database

`npm run seed` merges the sidecar into each row it upserts. Consequences worth
knowing:

- **The repo owns these five columns.** Unlike `sold` / `reserved` /
  `display_order` — which the seed deliberately preserves from the DB, since
  the webhook and the owner write them — metadata is overwritten on every
  seed. Deleting a key writes `NULL`. Edit the sidecar, not the DB row.
- **Malformed JSON is fatal.** The seed exits with the path and parse error
  rather than silently blanking a notebook's metadata.
- **A slug with no drawing on disk warns** (typo guard) but doesn't fail.
- Drawings registered through `POST /admin/drawings` — the booth flow, which
  writes rows straight from the phone — carry **no metadata** until the owner's
  next local `npm run seed`.
