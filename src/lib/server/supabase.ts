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
    created_at: string;
};

type Database = {
    public: {
        Tables: {
            drawings: {
                Row: Drawing;
                Insert: Omit<Drawing, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Drawing, 'id' | 'created_at' | 'updated_at'>>;
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
                // shipped_at/tracking_number stay optional on insert — the
                // webhook writes order rows without them (unshipped).
                Insert: Omit<Order, 'id' | 'created_at' | 'shipped_at' | 'tracking_number'> &
                    Partial<Pick<Order, 'id' | 'created_at' | 'shipped_at' | 'tracking_number'>>;
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
