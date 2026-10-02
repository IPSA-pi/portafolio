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
    title            TEXT,                             -- null = fall back to the slug
    year             INT,                              -- e.g. 2026
    medium           TEXT,                             -- e.g. Ballpoint pen on paper
    width_cm         NUMERIC,                          -- e.g. 7.6
    height_cm        NUMERIC,                          -- e.g. 12.7
    -- Digital copy. digital_object_path points into the PRIVATE
    -- `drawings-masters` bucket (never the public one); a row can deliver a
    -- file iff it is non-null. Written by upload-masters/the owner, not by seed.
    digital_object_path TEXT,                          -- e.g. 260619/260619_01.png
    -- Paid digital file (Stripe Managed Payments). Listed for sale iff
    -- digital_object_path IS NOT NULL AND digital_stripe_price_id IS NOT NULL
    -- AND digital_price_cents > 0 — derived, never stored.
    digital_stripe_product_id TEXT,
    digital_stripe_price_id   TEXT,
    digital_price_cents       INT,                     -- e.g. 2500 = $25.00 CAD
    sold             BOOLEAN     NOT NULL DEFAULT false,
    reserved         BOOLEAN     NOT NULL DEFAULT false,
    reserved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No index on `slug` alone: the UNIQUE constraint above already creates one,
-- and a second btree on the same column would be maintained on every insert,
-- sale, and reservation for nothing. That unique index is what serves
-- /api/checkout's `IN (slug, ...)` reservation query.
--
-- Nor are there partial indexes on `sold` / `reserved` / `reserved_at`. The
-- table is in the hundreds of rows, where Postgres correctly prefers a
-- sequential scan over any index; the reservation query reaches its rows
-- through the unique slug index and then filters at most 20 of them. Revisit
-- only if this table ever reaches a scale that makes a seq scan cost real
-- time — for one-of-a-kind originals, it won't.
CREATE INDEX idx_drawings_notebook ON drawings (notebook);
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
--
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'release-stale-reservations',
--   '*/10 * * * *', -- Every 10 minutes
--   $$
--     UPDATE drawings
--     SET reserved = false, reserved_at = null
--     WHERE reserved = true
--       AND sold = false
--       AND reserved_at < NOW() - INTERVAL '35 minutes';
--   $$
-- );


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
    -- Spotify enrichment (same shape as the Tidal pass)
    spotify_available BOOLEAN,
    spotify_album_url TEXT,
    -- Apple Music enrichment (same shape again; NULL = not yet checked)
    apple_available  BOOLEAN,
    apple_album_url  TEXT,
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


-- ────────────────────────────────────────────────────────────────────────────
-- ORDERS — one row per sold drawing, written at webhook fulfillment time.
-- This is the durable record of a sale (Stripe session + buyer details),
-- independent of the confirmation emails, which can fail to send.
--
-- A multi-item cart checkout produces ONE Stripe session covering several
-- drawings, so stripe_session_id is not unique by itself — the uniqueness
-- (and idempotency guard against double-inserting on a webhook retry) is on
-- the (stripe_session_id, drawing_slug) pair instead.
--
-- amount_total is per-drawing (that row's price_cents at sale time), NOT the
-- Stripe session's total — a session total written on every row of an N-item
-- cart would overcount revenue N times if you sum this column. Free shipping
-- and no discounts today, so per-item price is the honest allocation; revisit
-- if that ever changes.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE orders (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_slug       TEXT        NOT NULL,
    stripe_session_id  TEXT        NOT NULL,
    payment_intent     TEXT,
    amount_total       INT,
    customer_name      TEXT,
    customer_email     TEXT,
    shipping_address   JSONB,
    -- Fulfillment: stamped by /admin/sales/ship when the owner marks the
    -- package sent. A session ships as one package, so every row of that
    -- session gets the same shipped_at/tracking_number.
    shipped_at         TIMESTAMPTZ,
    tracking_number    TEXT,
    -- Which shipping option the buyer paid for: a ShippingOption id from
    -- src/lib/shipping.ts ('free' | 'standard' | 'registered'); NULL = not
    -- recorded (older orders, in-person, digital). shipping_cents is the fee
    -- for the whole ORDER, repeated on every row of the session — never sum it.
    shipping_method    TEXT,
    shipping_cents     INT,
    -- In-person sales: payment_method records cash/etransfer for booth sales.
    -- NULL = card via Stripe. Paired with stripe_session_id prefixed 'manual_'
    -- for in-person orders; shipped_at is set immediately (handover time).
    payment_method     TEXT,
    -- kind = 'original' | 'digital'; digital rows have null
    -- shipping_address/shipped_at and amount_total = digital_price_cents,
    -- pre-tax.
    kind               TEXT        NOT NULL DEFAULT 'original'
                       CONSTRAINT orders_kind_check CHECK (kind IN ('original', 'digital')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (stripe_session_id, drawing_slug)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- No public policies — only the service role (webhook) may read or write.


-- Migration (existing DBs):
/*
CREATE TABLE orders (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    drawing_slug       TEXT        NOT NULL,
    stripe_session_id  TEXT        NOT NULL,
    payment_intent     TEXT,
    amount_total       INT,
    customer_name      TEXT,
    customer_email     TEXT,
    shipping_address   JSONB,
    shipped_at         TIMESTAMPTZ,
    tracking_number    TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (stripe_session_id, drawing_slug)
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
*/

-- Migration (DBs whose orders table predates shipped tracking, 2026-07-17):
/*
ALTER TABLE orders
    ADD COLUMN shipped_at      TIMESTAMPTZ,
    ADD COLUMN tracking_number TEXT;
*/

-- Migration (DBs whose orders table predates in-person sales, 2026-07-30):
/*
ALTER TABLE orders
    ADD COLUMN payment_method TEXT;
*/

-- Migration (DBs whose orders table predates the shipping method, 2026-10-02).
-- Also kept as a standalone file:
-- scripts/migrations/2026-10-02-orders-shipping-method.sql
/*
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS shipping_method TEXT,
    ADD COLUMN IF NOT EXISTS shipping_cents  INT;
*/

-- Migration (DBs whose releases table predates Spotify enrichment, 2026-07-17):
/*
ALTER TABLE releases
    ADD COLUMN IF NOT EXISTS spotify_available BOOLEAN,
    ADD COLUMN IF NOT EXISTS spotify_album_url TEXT;
*/

-- Migration (DBs whose drawings table predates artwork metadata, 2026-08-03):
-- Also kept as a standalone file:
-- scripts/migrations/2026-08-03-drawings-artwork-metadata.sql
/*
ALTER TABLE drawings
    ADD COLUMN IF NOT EXISTS title     TEXT,
    ADD COLUMN IF NOT EXISTS year      INT,
    ADD COLUMN IF NOT EXISTS medium    TEXT,
    ADD COLUMN IF NOT EXISTS width_cm  NUMERIC,
    ADD COLUMN IF NOT EXISTS height_cm NUMERIC;
*/

-- Migration (DBs whose drawings table predates the digital copy, 2026-08-13):
-- Also kept as a standalone file:
-- scripts/migrations/2026-08-13-drawings-digital.sql
/*
ALTER TABLE drawings
    ADD COLUMN IF NOT EXISTS digital_object_path TEXT;
*/

-- Migration (DBs whose tables predate the paid digital file, 2026-10-01).
-- Also drops digital_url, which only a dev DB ever had. Also kept as a
-- standalone file:
-- scripts/migrations/2026-10-01-digital-sale.sql
/*
ALTER TABLE drawings
    ADD COLUMN IF NOT EXISTS digital_stripe_product_id TEXT,
    ADD COLUMN IF NOT EXISTS digital_stripe_price_id   TEXT,
    ADD COLUMN IF NOT EXISTS digital_price_cents       INT;

ALTER TABLE drawings
    DROP COLUMN IF EXISTS digital_url;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'original'
        CONSTRAINT orders_kind_check CHECK (kind IN ('original', 'digital'));
*/

-- Migration (DBs created before the redundant slug index was dropped,
-- 2026-08-09). See the note above the CREATE INDEX block for why. Also kept
-- as a standalone file:
-- scripts/migrations/2026-08-09-drop-redundant-slug-index.sql
/*
DROP INDEX IF EXISTS idx_drawings_slug;
*/

-- Migration (DBs whose releases table predates Apple Music enrichment,
-- 2026-08-13). Also kept as a standalone file:
-- scripts/migrations/2026-08-13-releases-apple-music.sql
/*
ALTER TABLE releases
    ADD COLUMN IF NOT EXISTS apple_available BOOLEAN,
    ADD COLUMN IF NOT EXISTS apple_album_url TEXT;
*/
