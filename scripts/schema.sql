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
