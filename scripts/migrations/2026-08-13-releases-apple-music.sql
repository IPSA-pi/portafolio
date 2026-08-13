-- Add Apple Music enrichment columns to releases (2026-08-13).
--
-- What: two nullable columns, mirroring the Tidal and Spotify pairs, filled in
-- by scripts/enrich-apple.js.
--
-- Why: /new-music gains an Apple Music pill alongside Tidal and Spotify. The
-- columns are nullable with NO default on purpose — NULL is load-bearing and
-- carries a third state the enrich pass depends on:
--   NULL  = never checked, pick it up on the next run
--   TRUE  = found in the catalog, apple_album_url is set
--   FALSE = searched and not found (re-checked for RECHECK_DAYS after release)
-- A DEFAULT FALSE would tell every existing row it had already been checked and
-- come up empty, and the pass would never look at any of them.
--
-- Note on the FALSE semantics: enrich-apple.js queries the public iTunes Search
-- API, whose catalog is the iTunes Store's — a close but imperfect overlap with
-- Apple Music. FALSE means "not found in the store catalog", which is a weaker
-- claim than the Tidal/Spotify columns make. See scripts/apple-client.js.
--
-- How to run: paste into the Supabase SQL editor — DEV first, then prod.
-- Idempotent (IF NOT EXISTS), and adding a nullable column with no default is a
-- metadata-only change in Postgres — no table rewrite, no lock worth planning
-- around.
--
-- Apply to BOTH the dev and prod projects.

ALTER TABLE releases
    ADD COLUMN IF NOT EXISTS apple_available BOOLEAN,
    ADD COLUMN IF NOT EXISTS apple_album_url TEXT;

-- Verify: both columns present, is_nullable = YES, column_default = NULL.
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'releases' AND column_name LIKE 'apple%';
