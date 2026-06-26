-- Run this in the Supabase SQL editor before running the seed script.
-- It creates the drawings table, indexes, RLS policies, and an
-- updated_at trigger.

CREATE TABLE drawings (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    slug             TEXT        UNIQUE NOT NULL,      -- e.g. negro_1_01
    notebook         TEXT        NOT NULL,             -- e.g. negro_1
    drawing_number   INT         NOT NULL,
    display_order    INT         NOT NULL DEFAULT 0,
    storage_url      TEXT        NOT NULL,             -- original webp in Supabase Storage
    stripe_product_id TEXT,
    stripe_price_id  TEXT,
    price_cents      INT,                              -- e.g. 15000 = $150.00
    sold             BOOLEAN     NOT NULL DEFAULT false,
    reserved         BOOLEAN     NOT NULL DEFAULT false,
    reserved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drawings_notebook ON drawings (notebook);
CREATE INDEX idx_drawings_slug     ON drawings (slug);
CREATE INDEX idx_drawings_order    ON drawings (notebook, display_order);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER drawings_updated_at
    BEFORE UPDATE ON drawings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row Level Security
ALTER TABLE drawings ENABLE ROW LEVEL SECURITY;

-- Anyone can read (public gallery)
CREATE POLICY "public_read" ON drawings
    FOR SELECT USING (true);

-- All writes (INSERT, UPDATE, DELETE) require the service role key.
-- The service role bypasses RLS automatically — no additional policy needed.
-- Never expose the service role key to the browser.

-- CRON JOB for releasing stale reservations
-- To run this, you need the pg_cron extension enabled in Supabase.
-- You can run this block in the Supabase SQL Editor:
/*
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'release-stale-reservations',
  '*/10 * * * *', -- Every 10 minutes
  $$
    UPDATE drawings 
    SET reserved = false, reserved_at = null
    WHERE reserved = true 
      AND sold = false 
      AND reserved_at < NOW() - INTERVAL '35 minutes';
  $$
);
*/


-- ────────────────────────────────────────────────────────────────────────────
-- NEW MUSIC — releases scraped from external sources (nodata.tv, etc.)
-- Powers the /new-music worklist. Same conventions as `drawings`:
-- public read, service-role writes, auto updated_at.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE releases (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source           TEXT        NOT NULL,            -- e.g. 'nodata.tv' (first source to find the release)
    sources          TEXT[]      NOT NULL DEFAULT '{}', -- all sources that found it, e.g. '{nodata.tv,ra.co}'
    source_guid      TEXT,                            -- stable per-source id (e.g. nodata numeric id)
    artist           TEXT        NOT NULL,
    title            TEXT        NOT NULL,
    dedupe_key       TEXT        UNIQUE NOT NULL,     -- lower(trim(artist)|trim(title)), global across sources
    release_year     INT,                             -- e.g. 2026, extracted from title bracket or source metadata
    label            TEXT,
    catalog_no       TEXT,
    genre            TEXT[],                          -- genre/category tags
    source_url       TEXT,
    released_at      DATE,                            -- source post / review date
    status           TEXT        NOT NULL DEFAULT 'new',  -- new|liked|queued|unavailable|dismissed
    -- Tidal enrichment (filled in stage 2/3)
    tidal_track_id   TEXT,
    tidal_album_url  TEXT,
    tidal_available  BOOLEAN,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_releases_status  ON releases (status, created_at DESC);
CREATE INDEX idx_releases_source  ON releases (source);
CREATE INDEX idx_releases_sources ON releases USING GIN (sources);

-- Reuse the set_updated_at() function defined above for drawings.
CREATE TRIGGER releases_updated_at
    BEFORE UPDATE ON releases
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

-- Anyone can read; the /new-music page itself is gated by Cloudflare Access.
CREATE POLICY "public_read" ON releases
    FOR SELECT USING (true);

-- All writes require the service role key (scraper + server actions). No policy needed.
