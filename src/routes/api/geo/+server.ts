import { json } from '@sveltejs/kit';

// The visitor's country as Cloudflare sees it, for pre-filling the ship-to
// selector. A hint only — VPNs, travellers and gifts all make it wrong — so
// nothing is ever blocked on it; the buyer can change the selector, and
// Stripe enforces the country they actually pick.
//
// Its own endpoint rather than layout data on purpose: page loads here can be
// publicly cached, and a visitor's country must never be baked into a cached
// page. `null` locally (no Cloudflare in front) and for Cloudflare's
// placeholders (XX unknown, T1 Tor).
export const GET = async ({ request, platform }) => {
    const raw =
        (platform as { cf?: { country?: string } } | undefined)?.cf?.country ??
        request.headers.get('cf-ipcountry');
    const country = raw && /^[A-Z]{2}$/.test(raw) && raw !== 'XX' ? raw : null;
    return json({ country }, { headers: { 'cache-control': 'private, no-store' } });
};
