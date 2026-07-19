// Cloudflare Access JWT verification, via `jose`.
//
// Cloudflare Access authenticates a user against your identity provider, then
// hands the browser a signed JSON Web Token (JWT). That token rides along as the
// `CF_Authorization` cookie (and, on Access-protected paths, the
// `Cf-Access-Jwt-Assertion` request header). Anyone can *send* such a cookie, so
// its mere presence proves nothing — what proves it genuine is the RS256
// signature, which only Cloudflare (holder of the private key) can produce. We
// verify that signature against Cloudflare's public keys and check the standard
// claims (audience, issuer, expiry). See learn/06-auth.md.
//
// jose works on the Cloudflare Workers runtime (it builds on Web Crypto).
// `createRemoteJWKSet` fetches Cloudflare's public keys and caches them, with a
// cooldown between refetches and automatic handling of key rotation.

import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksDomain: string | undefined;

/** Lazily build (and reuse) the remote key set for a given team domain. */
function getJwks(teamDomain: string) {
    if (!jwks || jwksDomain !== teamDomain) {
        jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
        jwksDomain = teamDomain;
    }
    return jwks;
}

/**
 * Verify a Cloudflare Access JWT. Returns true only if the RS256 signature is
 * valid *and* the token is for this application (`aud`), from this team (`iss`),
 * and unexpired (`exp`) — jose enforces all of these. Any failure throws inside
 * `jwtVerify`; we swallow it and return false so the caller just sees "not owner".
 */
export async function verifyAccessJwt(
    token: string,
    opts: { teamDomain: string; aud: string }
): Promise<boolean> {
    try {
        await jwtVerify(token, getJwks(opts.teamDomain), {
            issuer: opts.teamDomain,
            audience: opts.aud,
            algorithms: ['RS256']
        });
        return true;
    } catch {
        return false;
    }
}
