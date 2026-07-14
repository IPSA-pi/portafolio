import { getSupabase } from '$lib/server/supabase';
import { STALE_RESERVATION_MS } from '$lib/server/reservations';
import type { PageServerLoad } from './$types';

// Owner-only sales & inventory dashboard. Dynamic data — never prerender.
// The /admin layout load + Cloudflare Access already gate this page; the
// service-role Supabase client reads the private `orders` table safely
// because this only ever runs server-side.
export const prerender = false;

type NotebookRow = {
    notebook: string;
    total: number;
    sold: number;
    forSale: number; // priced, unsold, not actively reserved — buyable right now
    reserved: number; // active hold (reserved within the stale window)
    unlisted: number; // no price set — not for sale yet
};

export type RecentOrder = {
    sessionId: string;
    createdAt: string;
    customerName: string | null;
    customerEmail: string | null;
    address: string;
    slugs: string[];
    amount: number;
};

export const load: PageServerLoad = async () => {
    try {
        const supabase = getSupabase();
        const [ordersRes, drawingsRes] = await Promise.all([
            supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(2000),
            supabase
                .from('drawings')
                .select('slug, notebook, price_cents, sold, reserved, reserved_at'),
        ]);

        const orders = ordersRes.data ?? [];
        const drawings = drawingsRes.data ?? [];
        const now = Date.now();

        // ── Revenue & orders ─────────────────────────────────────────────
        // amount_total is per-drawing (see schema.sql), so summing rows is the
        // honest revenue total. One Stripe session can span several rows (a
        // cart), so distinct session ids give the order count.
        const day = 24 * 60 * 60 * 1000;
        const since7 = now - 7 * day;
        const since30 = now - 30 * day;

        let totalRevenue = 0;
        let revenue7 = 0;
        let revenue30 = 0;
        const sessions = new Set<string>();

        for (const o of orders) {
            const amt = o.amount_total ?? 0;
            const t = new Date(o.created_at).getTime();
            totalRevenue += amt;
            if (t >= since7) revenue7 += amt;
            if (t >= since30) revenue30 += amt;
            sessions.add(o.stripe_session_id);
        }

        const orderCount = sessions.size;
        const unitsSold = orders.length;
        const avgOrderValue = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

        // ── Recent orders, grouped by session (one card = one checkout) ───
        // orders arrive newest-first, so Map insertion order is newest-first too.
        const grouped = new Map<string, RecentOrder>();
        for (const o of orders) {
            const g =
                grouped.get(o.stripe_session_id) ??
                ({
                    sessionId: o.stripe_session_id,
                    createdAt: o.created_at,
                    customerName: o.customer_name,
                    customerEmail: o.customer_email,
                    address: formatAddress(o.shipping_address),
                    slugs: [],
                    amount: 0,
                } as RecentOrder);
            g.slugs.push(o.drawing_slug);
            g.amount += o.amount_total ?? 0;
            grouped.set(o.stripe_session_id, g);
        }
        const recentOrders = [...grouped.values()].slice(0, 25);

        // ── Inventory, per notebook ──────────────────────────────────────
        const byNotebook = new Map<string, NotebookRow>();
        const totals: Omit<NotebookRow, 'notebook'> = {
            total: 0,
            sold: 0,
            forSale: 0,
            reserved: 0,
            unlisted: 0,
        };

        for (const d of drawings) {
            const row =
                byNotebook.get(d.notebook) ??
                ({ notebook: d.notebook, total: 0, sold: 0, forSale: 0, reserved: 0, unlisted: 0 } as NotebookRow);

            const activelyReserved =
                d.reserved &&
                d.reserved_at != null &&
                now - new Date(d.reserved_at).getTime() < STALE_RESERVATION_MS;

            row.total++;
            totals.total++;
            if (d.sold) {
                row.sold++;
                totals.sold++;
            } else if (d.price_cents == null) {
                row.unlisted++;
                totals.unlisted++;
            } else if (activelyReserved) {
                row.reserved++;
                totals.reserved++;
            } else {
                row.forSale++;
                totals.forSale++;
            }

            byNotebook.set(d.notebook, row);
        }

        const inventory = [...byNotebook.values()].sort((a, b) => a.notebook.localeCompare(b.notebook));

        // Full per-drawing order history as CSV (one row per orders-table row),
        // for accounting/taxes. Built here so the page just triggers a download.
        const csv = buildOrdersCsv(orders);

        return {
            kpis: {
                totalRevenue,
                revenue30,
                revenue7,
                orderCount,
                unitsSold,
                avgOrderValue,
                forSale: totals.forSale,
                reserved: totals.reserved,
                unlisted: totals.unlisted,
            },
            totals,
            recentOrders,
            inventory,
            csv,
            ok: !ordersRes.error && !drawingsRes.error,
        };
    } catch (err) {
        // Missing env / table not created yet — render an empty dashboard, not a 500.
        console.error('sales dashboard load error:', (err as Error).message);
        return {
            kpis: {
                totalRevenue: 0,
                revenue30: 0,
                revenue7: 0,
                orderCount: 0,
                unitsSold: 0,
                avgOrderValue: 0,
                forSale: 0,
                reserved: 0,
                unlisted: 0,
            },
            totals: { total: 0, sold: 0, forSale: 0, reserved: 0, unlisted: 0 },
            recentOrders: [] as RecentOrder[],
            inventory: [] as NotebookRow[],
            csv: '',
            ok: false,
        };
    }
};

// One CSV row per orders-table row (per drawing). amount is in dollars (CAD).
function buildOrdersCsv(orders: Array<{
    created_at: string;
    stripe_session_id: string;
    drawing_slug: string;
    amount_total: number | null;
    customer_name: string | null;
    customer_email: string | null;
    shipping_address: unknown;
}>): string {
    const header = ['date', 'session_id', 'slug', 'amount_cad', 'customer_name', 'customer_email', 'address'];
    const rows = orders.map((o) => [
        o.created_at,
        o.stripe_session_id,
        o.drawing_slug,
        ((o.amount_total ?? 0) / 100).toFixed(2),
        o.customer_name ?? '',
        o.customer_email ?? '',
        formatAddress(o.shipping_address),
    ]);
    return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// RFC-4180 quoting: wrap in quotes when the value contains a comma, quote, or
// newline, doubling any embedded quotes.
function csvCell(value: string): string {
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Stripe shipping addresses arrive as a loose JSON blob. Flatten the common
// fields into one line for display; tolerate missing/oddly-shaped data.
function formatAddress(raw: unknown): string {
    if (!raw || typeof raw !== 'object') return '';
    const a = raw as Record<string, unknown>;
    const parts = [a.line1, a.line2, a.city, a.state, a.postal_code, a.country]
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
    return parts.join(', ');
}
