# Auth and cookies: how the owner gate works

Most of this site is public. A few surfaces are not: everything under `/admin`
(the owner hub and the endpoint that edits the music worklist). This chapter
explains how the site knows *you* are the owner, why that turns out to be a
surprisingly subtle problem, and how the same ideas apply to auth on any site.

## Cookies in 60 seconds

A **cookie** is a small `name=value` string the server asks the browser to store.
Once stored, the browser automatically attaches it to *every* future request to
that site — that's the whole trick. HTTP itself is stateless (each request knows
nothing about the last), so cookies are how a site recognizes a returning browser.

A cookie carries attributes that control its safety:

| Attribute | What it does | Why it matters |
|---|---|---|
| `HttpOnly` | Hides the cookie from JavaScript (`document.cookie`) | Stops a cross-site-scripting bug from stealing it |
| `Secure` | Only sent over HTTPS | Stops network eavesdroppers from reading it |
| `SameSite` | `Lax`/`Strict`/`None` — whether it's sent on cross-site requests | The core defense against CSRF (see the threats table) |
| `Domain` / `Path` | Which URLs the cookie is sent to | Scopes a cookie to exactly where it's needed |
| `Max-Age` / `Expires` | When the browser discards it | Absent = "session cookie", gone when the browser closes |

This site sets two cookies, and they're a nice contrast:

- **`session_seed`** (`hooks.server.ts`) — a random number used only to shuffle
  the gallery consistently for a visitor. It's *not* sensitive, so it's a plain
  session cookie (`httpOnly: false`, no expiry). If someone copied it, the worst
  they could do is see the same art order.
- **`CF_Authorization`** — the login token from Cloudflare Access (below). This
  one is sensitive: it's the difference between "a visitor" and "the owner."

> Concepts: **statelessness**, **cookies**, **cookie attributes as a security surface**.

## How Cloudflare Access proves who you are

The `/admin` paths sit behind **Cloudflare Access** (Zero Trust). When you request
one while logged out, Cloudflare — *not our code* — intercepts the request at the
edge and makes you authenticate with an identity provider (Google, a one-time
email code, etc.). Only after that does Cloudflare do two things:

1. Sets the **`CF_Authorization`** cookie on your browser, scoped to the whole
   domain, so it comes back on every later request — including public pages.
2. On the protected path, also injects a `Cf-Access-Jwt-Assertion` request header
   before forwarding to our origin.

Both of those values are the same thing: a **JWT** (JSON Web Token). A JWT is
three base64url chunks joined by dots — `header.payload.signature`. The payload is
just readable JSON claims (`aud`, `iss`, `exp`, your email…). The important part is
the **signature**: Cloudflare computes it with a *private* key that only it holds.
Anyone can verify that signature with Cloudflare's matching *public* key, but
nobody else can produce a valid one. That asymmetry is what makes the token
trustworthy — it's a sealed, tamper-evident statement of "Cloudflare logged this
person in."

> Concepts: **identity provider**, **JWT / JWS**, **public-key (asymmetric) signatures**,
> **the edge as a security boundary**.

## The subtle bug: "is the cookie there?" is not "is the cookie real?"

The first version of this gate just checked whether the `CF_Authorization` cookie
*existed*:

```typescript
// ⚠️ naive — do not do this
return Boolean(event.cookies.get('CF_Authorization'));
```

That is safe *only* as long as every path that reads it also sits behind Access,
because Access validates the token before the request ever reaches us. The moment
we made `/new-music` public (so visitors could browse), that assumption broke.
Cookies are **client-controlled**: anyone can open dev tools, or send a raw
request, with `Cookie: CF_Authorization=anything`. On a public path, Cloudflare no
longer vets it, so our presence check would happily treat a forged string as
"owner." The token being *unforgeable* only helps if we actually **check the
signature**.

## The fix: verify the signature and the claims

`src/lib/server/access.ts` verifies the token with [`jose`](https://github.com/panva/jose),
a JWT library that runs on Cloudflare's edge because it's built on the same Web
Crypto API. `createRemoteJWKSet` fetches and caches Cloudflare's public keys (and
handles key rotation); `jwtVerify` then checks the signature *and* the claims in
one call:

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

await jwtVerify(token, jwks, {
    issuer: teamDomain,   // must be minted by our Cloudflare team
    audience: appAud,     // must be for THIS Access application
    algorithms: ['RS256'] // and signed with the expected algorithm
});
// jose also rejects an expired token (`exp`) automatically.
// If any check fails it throws; we catch it and return "not owner".
```

Checking the claims matters as much as the signature. A valid signature only says
"Cloudflare minted this token"; the claims say it was minted **for this
application** (`aud`), **by our team** (`iss`), and **is still valid** (`exp`).
Skip those and a genuine token from a *different* Access app could be replayed
against ours. Pinning `algorithms` also blocks the classic JWT downgrade attack
where a token claims a weaker algorithm than you expect.

`hooks.server.ts` then reduces all of this to one boolean, `locals.isAdmin`, that
the rest of the app reads.

## Threats, and how each is handled

| Threat | What it is | Mitigation here |
|---|---|---|
| **Forged cookie** | Attacker invents a `CF_Authorization` value | Signature verification — a fake fails the crypto check |
| **Token replay from another app** | A real token, wrong audience | `aud` / `iss` claim checks |
| **Stale/stolen token reuse** | Using an old token forever | `exp` expiry check; Access sessions are short-lived |
| **XSS (script steals the cookie)** | Injected JS reads `document.cookie` | Access marks `CF_Authorization` `HttpOnly`; we never echo untrusted HTML |
| **CSRF (a page auto-submits as you)** | Another site rides your cookie | `SameSite` on the cookie; writes are `POST` behind Access |
| **Reaching the origin directly** | Skipping the edge check | Origin re-verifies the JWT itself; write endpoint also re-checks `locals.isAdmin` |
| **Key rotation / DoS on key fetch** | Keys change, or a bogus `kid` spams refetch | Keys cached with a TTL and a minimum refetch interval |

The pattern to notice: **defense in depth**. Cloudflare Access blocks unauthenticated
traffic at the edge; the origin independently verifies the token; and the write
endpoint re-checks `locals.isAdmin` one more time (a layout guard can't protect a
`+server.ts` endpoint, so it guards itself). Any single layer failing open still
leaves two behind it.

## Alternatives (and why this choice)

Cloudflare Access isn't the only way to gate an owner-only area. Common options,
roughly from simplest to most involved:

| Approach | Idea | Trade-off |
|---|---|---|
| **HTTP Basic auth** | Browser prompts for a shared password | Trivial, but one static secret, no real identity, easy to leak |
| **Signed session cookie** | You issue an `HMAC`-signed cookie after a login you build | Full control, but you own login, storage, rotation, resets |
| **Session + database** | Random session id in a cookie, state in a DB table | Easy revocation, but a DB round-trip per request |
| **OAuth / OIDC (Auth.js, Supabase Auth)** | Delegate login to Google/GitHub | Robust and standard, but more moving parts for a one-user site |
| **Cloudflare Access (this site)** | The platform handles login + issues a JWT | Zero login code; the app just *verifies* a token. Tied to Cloudflare |
| **Network-level (mTLS, IP allowlist)** | Only certain clients/networks connect | Very strong, but clumsy for a person on the move |

For a **single owner** on a site already hosted on Cloudflare, Access is the sweet
spot: no password to leak, no login UI to build, no session store to run — the app
only has to check a signature, which is exactly what `access.ts` does.

## Should this be written down at all?

Fair question: does documenting the gate *help* an attacker? The honest answer is
**no, and hiding it wouldn't help you** — this is the difference between *secrecy*
and *security*. A design is only genuinely secure if it stays safe even when the
attacker knows exactly how it works; the security has to live in the **secret key
and the verified signature**, never in "they don't know the endpoint exists."
Relying on the latter is called **security through obscurity**, and it fails the
moment someone reads your JavaScript, scans your routes, or finds this file.

What actually protects this site is unchanged whether or not you read this section:
the attacker still can't produce a valid signature without Cloudflare's private
key. What you must *never* publish is the opposite category — secrets themselves:
the service-role key, the Stripe secret, session-signing keys, the contents of
`.env.local`. Mechanisms can be open; keys must be closed. (That's also why
serious cryptography is public and peer-reviewed — obscurity is a comfort, not a
control.)

> Concept: **Kerckhoffs's principle** — a system should be secure even if
> everything about it except the key is public knowledge.
