# Building the cart: war stories

The single-item checkout described in [How the shop works](/learn/shop) shipped first and looked
solid. Turning it into a real multi-item cart — and then reviewing that work with fresh eyes —
surfaced a series of bugs that are worth walking through individually, because each one is really
a general lesson wearing a Stripe/Supabase costume. This chapter is that walkthrough.

## Collapsing two different states into one boolean

The very first version of "is this drawing available" was:

```ts
sold: d.sold || d.reserved
```

That reads fine until you notice what it *means*: a drawing someone merely clicked "Buy" on —
maybe seconds ago, maybe abandoned — displays identically to one that's actually, permanently
gone. Worse, a buyer who clicked Buy and then hit **Back** on Stripe's page came home to see their
*own* drawing marked "Sold," with no way to retry for up to 35 minutes (the reservation's own
release-if-abandoned window).

The fix was to stop collapsing the two facts and carry them separately:

```ts
sold:     d.sold,
reserved: d.reserved && !d.sold,
```

`sold` is permanent; `reserved` is temporary and can be undone. Once they're separate booleans,
the UI can tell a genuinely-gone drawing ("Sold," a hard stop) from a temporarily-held one ("On
hold — check back soon," with a path back to buying it).

> Concept: **state modeling**. `X || Y` is tempting whenever two conditions currently produce the
> same *visible* effect, but if they have different *meanings* — one reversible, one not — squashing
> them into one boolean throws away information the rest of the program (and the user) needs later.
> This is the same idea as not using a single `status: boolean` for something that actually has
> three states (`available` / `held` / `gone`).

## A library that doesn't throw the way you'd expect

Several places in this codebase call Supabase like this:

```ts
try {
    await getSupabase().from('orders').insert(rows);
} catch (err) {
    console.error('Error inserting order records:', err);
}
```

This looks like defensive error handling. It is — for *network* failures. But `supabase-js`
doesn't throw for a failed database operation (a missing table, a constraint violation, a bad
column); it **resolves successfully** with the problem described in the result object's `error`
field. The `try/catch` above can never catch that, because nothing throws. The `orders` table
didn't exist yet on the live database when this shipped, so every single insert was silently
failing — no error, no log line, nothing — for as long as it went unnoticed.

The fix is to always destructure and check the result, regardless of whether you also keep a
`try/catch` for genuine exceptions:

```ts
const { error: insertError } = await getSupabase().from('orders').insert(rows);
if (insertError) {
    console.error('Error inserting order records:', insertError);
}
```

> Concept: **know your dependency's actual failure contract, not the one you'd assume.** Not every
> library signals failure the same way (`throw`, a result-object error field, a rejected promise, a
> callback's first argument, a magic sentinel return value…). Skimming the docs for "what does
> success look like" is only half the job — you also have to check "what does *failure* look like,
> specifically, for this call."

## The replay bug: releasing someone else's reservation

This is the sharpest bug in the batch, so it's worth reading slowly. The endpoint that lets a
buyer cancel out of Stripe Checkout released a reservation like this:

```ts
// ⚠️ the version with the bug
await getSupabase()
    .from('drawings')
    .update({ reserved: false, reserved_at: null })
    .eq('slug', slug)
    .eq('sold', false);
```

That looks safe: it only touches *this* drawing, and only if it's not sold. But it says nothing
about *whose* reservation it's releasing. Walk through this sequence:

1. Buyer **A** starts checkout on a drawing. It's reserved, `reserved_at = 10:00:00`.
2. A abandons the tab. Nothing calls the cancel endpoint yet — the session id is just sitting in
   the URL, unused, because A never clicked anything.
3. Buyer **B** starts checkout on the *same* drawing later — legitimately, because A's session is
   dead and the drawing is fair game again. B's reservation is `reserved_at = 10:40:00`.
4. Someone (or something) replays A's old cancel request — a retried request, a re-opened old tab,
   or in principle an attacker who simply captured A's URL.
5. The query above runs: `slug = X AND sold = false`. It matches the row — the *current* row,
   whatever its `reserved_at` is now — and releases it. **B's live reservation, mid-payment, just
   got wiped**, and a third buyer could now buy the same one-of-a-kind drawing out from under B.

The missing piece is an **ownership check**: don't just ask "is this drawing reserved," ask "is
this drawing reserved *by the session I was actually given*":

```ts
// the fix — src/lib/server/reservations.ts
const sessionCreatedAt = new Date((session.created + 5) * 1000).toISOString();
await getSupabase()
    .from('drawings')
    .update({ reserved: false, reserved_at: null })
    .in('slug', slugs)
    .eq('sold', false)
    .lte('reserved_at', sessionCreatedAt);   // ← only release a hold at least as old as this session
```

If the reservation currently on the row is *newer* than the session doing the releasing, it can't
possibly be that session's own reservation — so leave it alone. A stale/replayed cancel request
becomes a safe no-op instead of a way to steal someone else's hold. (A second, related check —
never release a reservation backing a session that's already `paid` — closes the same door from a
slightly different angle: don't let a slow network race undo a successful payment either.)

This was verified, not just reasoned about: reserve as A, release A, reserve the same drawing as
B, then replay A's *original* cancel call against B's now-live reservation — B's hold survived,
confirming the fix actually blocks the exploit rather than just looking like it does on paper.

> Concept: **TOCTOU (time-of-check to time-of-use) and replay attacks**. Checking "is this thing in
> the state I expect" and then acting on it are two separate moments; if anything (a network retry,
> another user, an attacker) can act in between, your check is stale by the time you use it. The fix
> is almost always the same shape: bind the check to *something specific to the request being
> honored* (here: "only if the hold is at least as old as *this* session"), not just to the current
> state of the world.

## Trusting a URL to mean "you paid"

`/drawing?success=true&session_id=...` used to show "Thank you for your purchase!" and clear the
entire cart the instant those two params were present — no server round trip at all. Two ways that
goes wrong:

- **Delayed payment methods.** Stripe redirects to the success URL as soon as checkout is
  *submitted*, not necessarily once money has actually moved — a bank transfer or OXXO voucher can
  report `payment_status: 'unpaid'` at that exact moment and only settle minutes or hours later.
  The banner claimed a sale that hadn't happened yet.
- **It's just a string.** Nothing stops a browser from typing `?success=true&session_id=anything`
  into the address bar directly. The server was trusting user-supplied input to decide what to tell
  the user.

The fix adds one server round trip before the banner renders: a narrow endpoint that returns only
`{ paid, slugs }` for a given session id, and the page shows the confirmation *only* if `paid` is
true — otherwise a neutral "your payment is processing" notice, and the cart is left untouched
either way until it's earned.

> Concept: this is the same **client vs. server trust boundary** from
> ["Secrets never reach the browser"](/learn/overview#secrets-never-reach-the-browser), applied to
> a different kind of secret: not "don't leak data to the client," but "don't let the client tell
> you what happened — go check."

## An event handler that ate its child's keyboard input

The cart's "add to cart" button lives *inside* a clickable gallery tile — click the tile, open the
lightbox; click the button, add to cart, `stopPropagation()` stops it from also opening the
lightbox. That works fine with a mouse. With a keyboard, it didn't:

```ts
// the tile wrapper's keydown handler
onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goto(`/drawing/${notebookSlug}/${index + 1}`);
    }
}}
```

A keydown on the *button* still **bubbles up** through the DOM to this handler on the wrapper —
`stopPropagation` was only ever wired to the button's `click`, not its `keydown`. Tab to the price
button, press Enter, and this outer handler fires first, calling `preventDefault()` and navigating
away before the button ever gets to activate itself. A mouse click never has this problem because
there's nothing to bubble through in the same way for `click` (the button's own handler already
stops it) — the bug only exists for the *keyboard* path, which is exactly the kind of thing that's
invisible if you only ever test with a mouse.

The fix checks *where the event actually started*, not just what key was pressed:

```ts
onkeydown={(e) => {
    if (e.target !== e.currentTarget) return;   // let the nested button handle its own keydowns
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(/* … */); }
}}
```

> Concept: **event bubbling**, and why keyboard accessibility needs its own testing pass. `target`
> is where an event actually originated; `currentTarget` is whichever element's handler is
> currently running. They're only equal when the event started right there — any other bubbled
> event has a `target` somewhere further down the tree. Mouse and keyboard interactions don't always
> traverse the DOM the same way, so "it works when I click it" doesn't prove "it works when I tab to
> it and press Enter."

## A loop that raced against itself

Reserving a cart's drawings one at a time, in a loop, seemed like the obvious way to reuse the
existing single-item logic:

```ts
for (const slug of drawingSlugs) {
    await getSupabase().from('drawings')
        .update({ reserved: true, reserved_at: now })
        .eq('slug', slug).eq('sold', false)
        .or(`reserved.eq.false,reserved_at.lt.${staleThreshold}`);
    // ...
}
```

Send a body with a duplicate slug — `{ slugs: ['x', 'x'] }`, whether by an honest bug in a client
or a hand-crafted request — and the *second* iteration's `WHERE` clause matches nothing: the first
iteration just set `reserved = true, reserved_at = now()` on that row, so `reserved.eq.false` is
now false and `reserved_at.lt.staleThreshold` is false too (it's brand new, not stale). The request
fails with "no longer available" for an item that is, in fact, sitting right there available.

The immediate fix is to dedupe before doing anything else — `[...new Set(slugs)]` — so a request
never gets to race against its own earlier iteration. But this bug is also *why* the loop was later
replaced with a single set-based `UPDATE ... WHERE slug IN (...)` (see [Key safety
properties](/learn/shop#key-safety-properties)): one statement reserving N rows at once
can't race against itself the way N sequential statements can, because there's no "first iteration"
to have already changed the state the second one checks.

> Concept: **a request can conflict with itself**, not just with other concurrent requests. It's
> easy to design for "what if two users hit this at the same time" and forget "what if this one
> request's own steps interfere with each other." Deduping input and preferring one atomic
> operation over N sequential ones are two different fixes for the same underlying shape of bug.

## Designing for the user who doesn't follow the happy path

The cancel flow was built around one specific URL: Stripe's `cancel_url`, which fires when a buyer
clicks the "back to site" link *inside* Stripe Checkout. That covers the buyer who cancels the way
the UI suggests. It does nothing for the buyer who just presses the browser's own **Back** button,
or closes the tab — both perfectly normal things to do that never touch `cancel_url` at all. Their
reservation just sits there, "held," until the 35-minute staleness window quietly lets it go.

The fix accepts that the intended flow won't always happen, and adds a fallback that doesn't depend
on it: right before redirecting to Stripe, the browser stashes the session id in `sessionStorage`.
Landing back on the cart or notebook page then checks *either* signal — the explicit
`?canceled=true` URL, or a leftover `sessionStorage` marker — and releases the hold either way. It's
safe to call unconditionally, even when there's nothing to release, because the ownership and
payment guards from the earlier bug make a spurious call a no-op rather than a risk.

> Concept: **don't design for only the path you drew in the diagram.** Real users (and real
> browsers) will always find the exit you didn't wire up — closing a tab, using Back, following a
> bookmark, losing network mid-flow. Anywhere a flow depends on the user reaching a specific URL to
> "complete" it, ask what happens if they never do — and prefer a fallback that's *safe to run even
> when unnecessary* over trying to catch every possible way of leaving.

## Not every duplicate is a mistake — but check before you assume that

A price-formatting helper existed, copy-pasted, in four places by the time the cart shipped. Three
of them agreed: `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`, producing
`"$150.00"`. The fourth — the gallery's grid price badge — deliberately overrode it:

```ts
'$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
```

producing `"$150"` instead. The instinct when you spot four copies of "the same" function is to
extract one and delete the rest. Doing that blindly here would have made every grid badge
noticeably wider ("$150.00" instead of "$150") in a tiny fixed-size pill where the extra four
characters visibly crowd the layout — a real, if small, regression, and one a diff/type-checker
would never catch, because both versions type-check and both "work."

The actual fix extracted the shared logic but kept the *behavioral* difference explicit and
intentional instead of accidental:

```ts
// src/lib/utils/formatPrice.ts
export function formatPrice(cents: number, options?: { compact?: boolean }): string {
    if (options?.compact) {
        return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100);
}
```

One function, one place to fix a real bug in the formatting logic later, but the call site still
chooses which *style* it wants — `formatPrice(price)` for a full-width buy button,
`formatPrice(price, { compact: true })` for a cramped grid badge.

(The prices themselves are all **CAD** now — the site later standardized its currency, and having
one `formatPrice` meant that switch touched a single line here instead of the four copies it would
have before. The compact branch keeps `en-US` purely for its digit grouping; it prints a bare `$`
and no currency code, so the locale there is cosmetic.)

> Concept: **duplication isn't automatically a code smell** — sometimes near-identical code encodes
> a real difference in requirements (here: available layout width) that happens to look like an
> oversight. Before collapsing four copies into one, check whether they actually behave the same;
> if they don't, the right refactor preserves *both* behaviors behind one shared implementation,
> rather than silently picking one and calling it cleanup.
