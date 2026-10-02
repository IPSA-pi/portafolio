import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { ELSEWHERE, HOME_COUNTRY, isShippingCountry, type ShipTo } from '$lib/shipping';

// Where the buyer wants their order shipped. Client-side only, like the cart:
// the server never trusts it beyond handing it to Stripe, which then only
// accepts an address in that country.
//
// Starts at the home country (what checkout assumed before the selector
// existed), then — unless the buyer has already chosen — takes Cloudflare's
// guess from /api/geo: a country we ship to preselects itself, any other
// known country preselects "somewhere else". An explicit choice is remembered
// and never overridden by the guess.
const STORAGE_KEY = 'shipto:v1';

const isShipTo = (v: unknown): v is ShipTo => v === ELSEWHERE || isShippingCountry(v);

function saved(): ShipTo | null {
    if (!browser) return null;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return isShipTo(raw) ? raw : null;
    } catch {
        return null;
    }
}

const initial = saved();
export const shipTo = writable<ShipTo>(initial ?? HOME_COUNTRY);

/** The buyer picked this themselves — remember it. */
export function chooseShipTo(value: ShipTo) {
    shipTo.set(value);
    explicit = true;
    if (!browser) return;
    try {
        localStorage.setItem(STORAGE_KEY, value);
    } catch {
        /* storage unavailable — in-memory only */
    }
}

let explicit = initial !== null;
let guessed = false;

/** Fill in Cloudflare's guess, once per page load, if the buyer hasn't chosen. */
export async function guessShipTo() {
    if (!browser || explicit || guessed) return;
    guessed = true;
    try {
        const res = await fetch('/api/geo');
        if (!res.ok) return;
        const { country } = await res.json();
        if (explicit || !country) return;
        shipTo.set(isShippingCountry(country) ? country : ELSEWHERE);
    } catch {
        /* a hint, not a requirement */
    }
}
