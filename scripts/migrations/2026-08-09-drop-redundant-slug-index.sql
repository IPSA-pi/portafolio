-- Drop the redundant index on drawings.slug (2026-08-09).
--
-- `slug TEXT UNIQUE NOT NULL` already creates a unique btree index on the
-- column, so idx_drawings_slug was a second, identical index maintained on
-- every insert, sale, and reservation — write cost with no read benefit. The
-- unique index still backs /api/checkout's `IN (slug, ...)` reservation query;
-- nothing loses a plan by this.
--
-- Safe to run on a live DB: DROP INDEX takes a brief ACCESS EXCLUSIVE lock on
-- the table. At this table's size that is milliseconds, but CONCURRENTLY is
-- included below if you'd rather not block writes at all. Run one, not both.
--
-- Apply to BOTH the dev and prod projects.

DROP INDEX IF EXISTS idx_drawings_slug;

-- Non-blocking alternative (cannot run inside a transaction block):
-- DROP INDEX CONCURRENTLY IF EXISTS idx_drawings_slug;

-- Verify: should list the unique constraint's index but not idx_drawings_slug.
-- SELECT indexname FROM pg_indexes WHERE tablename = 'drawings';
