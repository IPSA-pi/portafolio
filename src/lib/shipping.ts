// Where originals ship, what it costs, and what a buyer anywhere else does
// instead. Shared by the client (the ship-to selector, the copy) and the server
// (api/checkout builds the Stripe session from it; the webhook reads the
// chosen option back), so the price a buyer is shown and the price Stripe
// charges cannot drift.

// The countries the online checkout ships to. Nothing type-checks the codes —
// a wrong one makes Stripe reject session creation, i.e. checkout 500s for
// that country — so try a test checkout after editing. Buyers anywhere else
// email instead (INTERNATIONAL_SALES_EMAIL below).
//
// Changing the list? SHIPS_ABROAD_TO below is the human summary of it, and
// /terms §3 spells the regions out by hand.
export const HOME_COUNTRY = 'CA';

export const SHIPPING_COUNTRIES = [
    HOME_COUNTRY,
    'US',
    'JP',
    // Europe: the EU 27…
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
    // …plus the UK and the EFTA countries.
    'GB', 'CH', 'NO', 'IS', 'LI',
    // Latin America.
    'MX', 'AR', 'BR', 'CL', 'CO', 'CR', 'EC', 'PA', 'PE', 'UY'
] as const;

export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

// The non-Canadian part of SHIPPING_COUNTRIES in words, for DrawingFacts.
export const SHIPS_ABROAD_TO = 'the US, Europe, Japan and Latin America';

export function isShippingCountry(code: unknown): code is ShippingCountry {
    return typeof code === 'string' && (SHIPPING_COUNTRIES as readonly string[]).includes(code);
}

// What the ship-to selector holds: a country the checkout ships to, or
// "somewhere else", which swaps the pay button for the email route.
export const ELSEWHERE = 'ELSEWHERE';
export type ShipTo = ShippingCountry | typeof ELSEWHERE;

// Per ORDER, not per drawing: several drawings share one mailer. Prices are
// CAD cents, set from Canada Post's letter-post rates (checked 2026-10-02):
// a rigid mailer is "non-standard / oversize" — $8.60 international up to
// 100 g ($4.29 to the US) — and Registered Mail adds $26.25 abroad. One flat
// fee covers everywhere outside Canada; the US margin pays for the mailer.
// A cart heavy enough to pass 100 g (the next step is $14.99) eats into it.
export type ShippingOption = {
    id: 'free' | 'standard' | 'registered';
    /** Shown at Stripe Checkout and in the owner's sale email. */
    label: string;
    amountCents: number;
    tracked: boolean;
};

const DOMESTIC: ShippingOption[] = [
    { id: 'free', label: 'Free shipping', amountCents: 0, tracked: false }
];

// Order matters: Stripe preselects the first.
const INTERNATIONAL: ShippingOption[] = [
    { id: 'standard', label: 'Standard international mail (untracked)', amountCents: 1000, tracked: false },
    { id: 'registered', label: 'Registered mail (with a tracking number)', amountCents: 3500, tracked: true }
];

export function shippingOptionsFor(country: ShippingCountry): ShippingOption[] {
    return country === HOME_COUNTRY ? DOMESTIC : INTERNATIONAL;
}

export const INTERNATIONAL_STANDARD_CENTS = INTERNATIONAL[0].amountCents;
export const INTERNATIONAL_REGISTERED_CENTS = INTERNATIONAL[1].amountCents;

// The option a paid session ended up with, recovered from what the buyer was
// charged for shipping (Stripe's ad-hoc rates carry no id of ours). null when
// the amount matches nothing — an old session, or prices edited since.
export function shippingOptionForAmount(amountCents: number | null | undefined): ShippingOption | null {
    if (amountCents == null) return null;
    return [...DOMESTIC, ...INTERNATIONAL].find((o) => o.amountCents === amountCents) ?? null;
}

// English country names from the runtime, so the list above is the only
// thing to edit. Sorted by name, home country first.
export function shippingCountryNames(): { code: ShippingCountry; name: string }[] {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return SHIPPING_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
        a.code === HOME_COUNTRY ? -1 : b.code === HOME_COUNTRY ? 1 : a.name.localeCompare(b.name)
    );
}

// Buyers outside SHIPPING_COUNTRIES email instead — this is the one place
// that address lives. `slugs` names what they want, so the cart survives the
// trip to the mail client (the cart itself never leaves their browser).
export const INTERNATIONAL_SALES_EMAIL = 'iansebelius@gmail.com';

export function internationalMailto(slugs?: string | string[]): string {
    const list = slugs === undefined ? [] : Array.isArray(slugs) ? slugs : [slugs];
    const subject = list.length === 1 ? `International purchase: ${list[0]}` : 'International purchase';
    const body =
        list.length > 0
            ? `Hi Ian,\n\nI'd like to buy:\n${list.map((s) => `- ${s}`).join('\n')}\n\nShipping to (country): \n`
            : '';
    return `mailto:${INTERNATIONAL_SALES_EMAIL}?subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
}
