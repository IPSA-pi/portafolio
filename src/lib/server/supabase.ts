import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';

export type Drawing = {
    id: string;
    slug: string;
    notebook: string;
    drawing_number: number;
    display_order: number;
    storage_url: string;
    stripe_product_id: string | null;
    stripe_price_id: string | null;
    price_cents: number | null;
    // Artwork metadata — owned by the repo (scripts/metadata/<notebook>.json,
    // written by scripts/seed.js), nullable everywhere: most rows have none.
    title: string | null;
    year: number | null;
    medium: string | null;
    width_cm: number | null;
    height_cm: number | null;
    // Digital copy. `digital_object_path` points into the PRIVATE
    // `drawings-masters` bucket — never serialize it to the client, and never
    // build a public URL from it. A row can deliver a file iff it is non-null;
    // availability is derived from that, not stored as a third flag.
    digital_object_path: string | null;
    // Paid digital file (Part P). Written by set-digital-price.js, never by
    // seed. "Listed" is derived from these plus digital_object_path — see
    // digitalListing() in digital.ts, the only place that rule lives.
    digital_stripe_product_id: string | null;
    digital_stripe_price_id: string | null;
    digital_price_cents: number | null;
    sold: boolean;
    reserved: boolean;
    reserved_at: string | null;
    created_at: string;
    updated_at: string;
};

export type ReleaseStatus = 'new' | 'liked' | 'queued' | 'unavailable' | 'dismissed';

export type Release = {
    id: string;
    source: string;
    sources: string[];
    source_guid: string | null;
    artist: string;
    title: string;
    dedupe_key: string;
    release_year: number | null;
    label: string | null;
    catalog_no: string | null;
    genre: string[] | null;
    source_url: string | null;
    released_at: string | null;
    status: ReleaseStatus;
    tidal_track_id: string | null;
    tidal_album_url: string | null;
    tidal_available: boolean | null;
    spotify_album_url: string | null;
    spotify_available: boolean | null;
    apple_album_url: string | null;
    apple_available: boolean | null;
    created_at: string;
    updated_at: string;
};

export type Order = {
    id: string;
    drawing_slug: string;
    stripe_session_id: string;
    payment_intent: string | null;
    amount_total: number | null;
    customer_name: string | null;
    customer_email: string | null;
    shipping_address: unknown | null;
    shipped_at: string | null;
    tracking_number: string | null;
    payment_method: string | null;
    // The shipping option the buyer paid for (a ShippingOption id from
    // $lib/shipping) and the fee for the whole order, repeated on every row
    // of the session. Null when not recorded. Optional in the type as well:
    // a DB that hasn't run the 2026-10-02 migration returns rows without them.
    shipping_method?: string | null;
    shipping_cents?: number | null;
    // 'digital' rows have null shipping_address/shipped_at; amount_total is
    // digital_price_cents, pre-tax. Defaults to 'original' in the DB.
    kind: 'original' | 'digital';
    created_at: string;
};

type Database = {
    public: {
        Tables: {
            drawings: {
                Row: Drawing;
                // The artwork-metadata columns stay optional on insert: the seed
                // supplies them, but /admin/drawings registers rows without any.
                // `digital_object_path` is optional for a stronger reason — it
                // is owned by upload-masters and the owner, so no insert path
                // should be able to name it, and an upsert that omitted it
                // must leave whatever is there untouched. The three digital_*
                // price columns are owned by set-digital-price.js, not by seed,
                // for the same reason.
                Insert: Omit<Drawing, 'id' | 'created_at' | 'updated_at' | 'title' | 'year' | 'medium' | 'width_cm' | 'height_cm' | 'digital_object_path' | 'digital_stripe_product_id' | 'digital_stripe_price_id' | 'digital_price_cents'> &
                    Partial<Pick<Drawing, 'id' | 'created_at' | 'updated_at' | 'title' | 'year' | 'medium' | 'width_cm' | 'height_cm' | 'digital_object_path' | 'digital_stripe_product_id' | 'digital_stripe_price_id' | 'digital_price_cents'>>;
                Update: Partial<Omit<Drawing, 'id'>>;
                Relationships: [];
            };
            releases: {
                Row: Release;
                Insert: Omit<Release, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Release, 'id' | 'created_at' | 'updated_at'>>;
                Update: Partial<Omit<Release, 'id'>>;
                Relationships: [];
            };
            orders: {
                Row: Order;
                // shipped_at/tracking_number/payment_method/kind stay optional on insert — the
                // webhook writes order rows without them (unshipped, card payment, kind
                // defaulting to 'original'). shipping_method/shipping_cents are optional on
                // the Order type itself.
                Insert: Omit<Order, 'id' | 'created_at' | 'shipped_at' | 'tracking_number' | 'payment_method' | 'kind'> &
                    Partial<Pick<Order, 'id' | 'created_at' | 'shipped_at' | 'tracking_number' | 'payment_method' | 'kind'>>;
                Update: Partial<Omit<Order, 'id'>>;
                Relationships: [];
            };
        };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
};

let _client: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
    if (!_client) {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
        }
        _client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return _client;
}
