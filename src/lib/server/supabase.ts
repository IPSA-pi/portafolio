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

type Database = {
    public: {
        Tables: {
            drawings: {
                Row: Drawing;
                Insert: Omit<Drawing, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<Drawing, 'id' | 'created_at' | 'updated_at'>>;
                Update: Partial<Omit<Drawing, 'id'>>;
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
