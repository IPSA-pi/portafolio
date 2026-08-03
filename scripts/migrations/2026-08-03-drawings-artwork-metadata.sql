-- 2026-08-03 — Per-artwork metadata on `drawings`.
--
-- What: adds the five nullable gallery-metadata columns (title, year, medium,
-- width_cm, height_cm) that back the tombstone caption, alt text, and the
-- purchase-confirmation emails.
--
-- Why: a drawing's only descriptive field today is its slug, so every caption
-- and alt reads like a file listing. These columns are authored in the repo as
-- per-notebook JSON sidecars (scripts/metadata/<notebook>.json) and written by
-- `npm run seed` — the repo owns them, unlike sold/reserved/display_order.
--
-- Every column is nullable: with all-null values every display site renders
-- exactly as it does today (current prod data has none).
--
-- How to run: paste into the Supabase SQL editor — DEV first. Prod stays
-- untouched until the owner decides to roll it out. Idempotent (IF NOT EXISTS).

ALTER TABLE drawings
    ADD COLUMN IF NOT EXISTS title     TEXT,     -- null = fall back to the slug
    ADD COLUMN IF NOT EXISTS year      INT,      -- e.g. 2026
    ADD COLUMN IF NOT EXISTS medium    TEXT,     -- e.g. Ballpoint pen on paper
    ADD COLUMN IF NOT EXISTS width_cm  NUMERIC,  -- e.g. 7.6
    ADD COLUMN IF NOT EXISTS height_cm NUMERIC;  -- e.g. 12.7
