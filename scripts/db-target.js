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
