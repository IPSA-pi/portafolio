import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

/**
 * Owner check for the private (admin) section.
 *
 * In production the (admin) routes sit behind Cloudflare Access (Zero Trust):
 * unauthenticated traffic never reaches the origin, and CF injects a signed
 * assertion (`Cf-Access-Jwt-Assertion` header / `CF_Authorization` cookie) only
 * after a successful login. Because Access terminates before our origin, the mere
 * presence of that assertion is a trustworthy signal here. (A full JWT signature
 * verification against the team's public keys can be layered on later.)
 *
 * Locally there is no Access in front, so `ADMIN_DEV_BYPASS=1` opens the section.
 */
function isOwner(event: Parameters<Handle>[0]['event']): boolean {
    if (env.ADMIN_DEV_BYPASS === '1') return true;
    return Boolean(
        event.request.headers.get('cf-access-jwt-assertion') || event.cookies.get('CF_Authorization')
    );
}

export const handle: Handle = async ({ event, resolve }) => {
    let seed = Number(event.cookies.get('session_seed'));
    if (!seed) {
        seed = Math.floor(Math.random() * 2 ** 32);
        event.cookies.set('session_seed', String(seed), {
            path: '/',
            sameSite: 'lax',
            httpOnly: false,
            // no maxAge — session cookie, expires when browser closes
        });
    }
    event.locals.sessionSeed = seed;
    event.locals.isAdmin = isOwner(event);
    return resolve(event);
};
