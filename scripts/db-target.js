/**
 * Print which Supabase project a script is about to touch, so a prod run
 * is never silent. DB_LABEL lives in the env file next to the credentials
 * it describes (dev in .env.local, prod in .env.prod) — the label always
 * travels with the keys.
 */
export function logDbTarget(url) {
    const ref = new URL(url).hostname.split('.')[0];
    const label = (process.env.DB_LABEL ?? 'unlabeled').toUpperCase();
    console.log(`Supabase target: ${ref} [${label}]`);
}

/**
 * Same idea for Stripe: the key's mode is derived from its prefix and printed
 * (never the key itself), so a run that pairs the prod DB with the wrong
 * Stripe account is visible before anything is written.
 */
export function logStripeTarget(key) {
    const mode = key?.startsWith('sk_live_') ? 'LIVE'
        : key?.startsWith('sk_test_') ? 'TEST'
        : 'UNKNOWN MODE';
    console.log(`Stripe target: [${mode}]`);
}
