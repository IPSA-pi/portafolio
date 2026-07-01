import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { verifyAccessJwt } from '$lib/server/access';

// Team login domain (e.g. https://myteam.cloudflareaccess.com) and the Access
// application's Audience (AUD) tag. Set both in the Workers env / .env.local.
const TEAM_DOMAIN = env.CF_ACCESS_TEAM_DOMAIN?.replace(/\/$/, '');
const ACCESS_AUD = env.CF_ACCESS_AUD;

/**
 * Owner check, exposed as `locals.isAdmin` and used to unlock owner-only controls
 * (e.g. editing on /new-music) and gate the write endpoints under /admin.
 *
 * Owner-only paths sit behind Cloudflare Access (Zero Trust): after login CF hands
 * the browser a signed JWT as the `CF_Authorization` cookie (and injects the
 * `Cf-Access-Jwt-Assertion` header on protected paths). The cookie is domain-wide,
 * so it also rides along on public pages — which is exactly why we must *verify its
 * signature* rather than trust its presence: cookies are client-controlled, and a
 * forged `CF_Authorization` would otherwise fool any path not fronted by Access.
 * `verifyAccessJwt` checks the RS256 signature against Cloudflare's public keys
 * plus the audience/issuer/expiry claims. See LEARN.md → "Auth & cookies".
 *
 * Locally there is no Access in front, so `ADMIN_DEV_BYPASS=1` turns this on.
 */
async function isOwner(event: Parameters<Handle>[0]['event']): Promise<boolean> {
    if (env.ADMIN_DEV_BYPASS === '1') return true;

    const token =
        event.request.headers.get('cf-access-jwt-assertion') ?? event.cookies.get('CF_Authorization');
    if (!token) return false;

    if (!TEAM_DOMAIN || !ACCESS_AUD) {
        console.error('CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD not set — refusing owner access');
        return false; // fail closed
    }

    return verifyAccessJwt(token, { teamDomain: TEAM_DOMAIN, aud: ACCESS_AUD });
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
    event.locals.isAdmin = await isOwner(event);
    return resolve(event);
};
