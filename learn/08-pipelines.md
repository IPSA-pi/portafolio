# Data pipelines and automation

The site has a second life outside the request/response cycle: Node scripts in `scripts/` that
move data *into* it. Two pipelines, each a sequence of stages run in order:

```
Drawings:   rename → standardize-images → upload → seed → set-price
New music:  scrape → enrich (Tidal) → enrich (Spotify) → enrich (Apple Music)
```

The drawings pipeline is covered in pieces elsewhere ([images](/learn/images) for the media
stages, [the shop](/learn/shop) for pricing). This chapter uses the **music pipeline** — a daily
scraper feeding the `/new-music` worklist — because it has the most interesting property: it's an
*automated* writer sharing a table with a *human* editor, and it must never win an argument with
them. Then it closes with the guardrails that keep every script in the repo from hurting
production.

## A pipeline that must not overwrite its owner

`/new-music` is a worklist: a scraper collects new releases from music sites daily, and the owner
works through them, marking each one `liked`, `queued`, `dismissed`… That status lives in the
same `releases` row the scraper created. A naive pipeline — "fetch everything, upsert
everything" — would re-write those rows every morning and reset the owner's decisions.

So the scrape is **insert-only** by construction:

```js
// scripts/scrape-music.js — inserts ignore conflicts on dedupe_key, so existing
// rows (and the owner's manually-set status) are never clobbered
const { error } = await supabase
    .from('releases')
    .upsert(chunk, { onConflict: 'dedupe_key', ignoreDuplicates: true });
```

Re-running it only ever *adds* releases. The enrich stages follow the same rule from the other
side: they only fill columns that are still `NULL` (`tidal_available IS NULL`), never columns
that already hold an answer.

> Concept: **idempotent, re-runnable jobs — and system data vs human data.** A scheduled job
> *will* run again, on overlapping input, possibly twice on the same day after a manual
> trigger. Design every stage so that re-running it is boring. And when automation and a human
> share a table, draw a hard line through the columns: the machine owns what it measured
> (`sources`, `tidal_available`), the human owns what they decided (`status`), and neither
> writes on the other's side of the line.

## Duplicates need a definition before you can remove them

The same release shows up on multiple sources, spelled slightly differently. Rows are therefore
keyed not by source but by a **normalized natural key**:

```js
function dedupeKey(artist, title) {
    return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}
```

Two sources reporting the same artist + title collapse into one row; a `sources` array records
everyone who found it, and the first source to insert a row owns its metadata (later runs only
merge the `sources` list and fill a missing `release_year`).

> Concept: **identity is a design decision.** "Are these two records the same thing?" has no
> universal answer — you choose a key, normalize both sides, and accept the trade-off (this key
> treats a remaster and the original as one release; a stricter key would create duplicates
> instead). Choosing it *explicitly*, in one function, beats letting five call sites each
> improvise their own comparison.

## One bad source shouldn't kill the run

Each scrape source is a module (`scripts/sources/ra.js`, `nodata.js`) with the same interface,
and each is fetched inside its own `try/catch`:

```js
for (const source of SOURCES) {
    try {
        const releases = await source.fetch();
        for (const r of releases) rows.push({ ...r, dedupe_key: dedupeKey(r.artist, r.title) });
    } catch (err) {
        console.error(`${source.name}: failed —`, err.message);   // log it, keep going
    }
}
```

Websites go down, feeds change shape, GraphQL schemas move. If Resident Advisor breaks, the
nodata.tv releases still land — the daily run degrades instead of dying.

> Concept: **partial failure tolerance.** In a batch job that aggregates independent inputs, the
> failure domain should be one input, not the whole run. The inverse design (one `try/catch`
> around everything) turns the least reliable source into the ceiling for the entire pipeline.

## Search APIs return answers, not truth

The enrich stages ask Tidal, Spotify and Apple Music "is this release on your platform?" — and the obvious
implementation (search, trust the top hit) is wrong. Catalog search is a loose,
popularity-weighted text match: for an artist with *no* matching release, it happily returns
that artist's other albums instead. Trusting it would stamp `available ✓` on releases that
aren't there.

So the client only accepts a candidate whose **own title matches the title we're looking for** —
and even that comparison is directional:

```js
// `candidateTitle` is allowed to be `expectedTitle` plus extra decoration
// (e.g. Tidal listing "Quench, Vol. 1 (Air) - EP" for our "Quench Vol. 1 (Air)").
// The reverse is deliberately NOT accepted: checking whether our title contains
// the candidate's let a generic short album literally titled "Kind" falsely
// match our "Kind 013" — any short candidate title is a substring of half the
// things people release.
```

A candidate may *extend* the expected title, never the other way around. And the result is
interpreted honestly: a ✗ in this pipeline means "not confidently found," not "proven absent" —
the owner double-checks misses by hand, which costs a minute; a false ✓ would silently hide a
release, which costs the whole point of the list.

> Concept: **precision vs recall.** When a matcher can't be perfect, decide *which* mistake is
> cheaper before writing the code. Here a false positive is worse than a false negative, so every
> tie breaks toward "no match" — and the schema records `NULL` (never checked), `true`, and
> `false` as three distinct states so an uncertain answer can be re-asked later.

These rules were worked out against Tidal, but every catalog search fails the same way, so they
live in one shared module (`scripts/match.js`) that all three clients import. Apple's search
returns the right album first for "Rrose — Please Touch" and Cardi B's "Please Me" second, which
is exactly the trap the artist check exists to catch.

The Spotify client was the last to adopt them, and what it cost to find out is the lesson. It had
shipped with a looser matcher that accepted the first candidate whose *title* matched, with no
check on who the album was credited to. Re-running the strict rules over rows already marked
available flipped three of fifty-nine — "A Made Up Sound — Sunday" had been linked to "Sunday
Drift" by Osmond Beliér, and "Beatrice M. — Midnight Swim" to a "Midnight Swim" by Skye Beatrice.
Wrong for months, in a column that looked perfectly healthy.

> Concept: **a fix to a rule is not a fix to the data the rule already produced.** The enrich
> pass only ever revisits rows that are `NULL` or recently `false`, so tightening the matcher
> would have changed nothing that was already stored — the bad rows were, by construction, the
> ones marked `true` and never re-asked. That's why the script grew a `--recheck-all` flag. When
> you correct a heuristic, ask separately what it already wrote, and make re-deriving it possible.

The Apple stage adds one more honesty problem. It queries the public **iTunes Search API**, whose
catalog is the iTunes Store's — a close but imperfect overlap with Apple Music. So its `false`
means something slightly weaker than the other two columns' `false` do, and that difference is
written down in the migration and the client's header rather than left for a future reader to
discover. A column whose meaning is subtler than its name is fine; a column whose meaning is
subtler than its name *and undocumented* is a bug waiting to be written.

## Being a polite API client

Two of the three enrich clients authenticate with the OAuth **client-credentials** grant (an app
identity — no user login, which is all a catalog search needs); the Apple one needs no
credentials at all. All three are built not to hammer anyone:

- **Token caching** — the access token is fetched once and reused until shortly before it
  expires (a 60-second margin, so a token never dies mid-request), instead of re-authenticating
  per search.
- **Backoff on 429** — when the API answers `429 Too Many Requests`, the client reads the
  `Retry-After` header, waits exactly that long, and retries:

```js
if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after')) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return fetchSearchResults({ token, query, countryCode });
}
```

The Apple client is the interesting variation. Its endpoint is unauthenticated — which sounds
easier, and is, right up until you notice there's no API key to identify you and therefore no
generous per-key quota to spend. Apple publishes a limit of roughly 20 calls a minute and signals
a throttle with **403**, not 429. So that client waits a full second between rows instead of 300
milliseconds, retries on 403 as well as 429, and — unlike the others — *bounds* its retries:

```js
if (attempt >= MAX_ATTEMPTS) {
    throw new Error(`Apple search throttled for "${term}": ${res.status} after ${attempt} attempts`);
}
```

Retrying forever is reasonable when a 429 means "you're briefly ahead of your own quota." It's
the wrong response to a sustained 403, which means you're over a limit that isn't going to move —
there, spinning quietly is worse than failing loudly.

> Concept: **rate limiting is a contract, not an obstacle.** The server is telling you the pace
> it can sustain; a well-behaved client caches what's reusable, honors `Retry-After`, and treats
> 429 as flow control rather than an error. (It's also self-interest — clients that ignore it
> get their keys throttled or revoked.) But read *which* signal you're getting: "slow down" and
> "you can't have this" deserve different code.

## Scheduling: a robot runs this daily

Nobody runs the music pipeline by hand. A GitHub Actions workflow
(`.github/workflows/scrape-music.yml`) runs all four stages every morning:

```yaml
on:
  schedule:
    - cron: '0 13 * * *'    # daily at 13:00 UTC = 6am Pacific during PDT
  workflow_dispatch: {}      # plus a manual "Run workflow" button
```

(GitHub's cron is UTC-only with no DST handling, so a schedule pinned to a local wall-clock hour
drifts by an hour twice a year. Pick the offset you can live with and write down which one it is.)

Two details worth copying. First, CI gets its credentials from **repo secrets injected as env
vars**, never from the gitignored env files — so local credentials and CI credentials can rotate
independently. Second, the credentialed enrich stages **skip themselves cleanly** (exit 0 with a
warning) if their API keys aren't configured yet — so the pipeline could ship, and run, before
every integration existed, each stage lighting up when its secrets arrived. (The Apple stage has
no keys to wait for, so it simply always runs.)

> Concept: **cron + graceful degradation.** A scheduled pipeline should be buildable
> incrementally: stages that aren't ready yet are no-ops, not failures, and a missing optional
> credential is a warning, not a crash. The alternative — a pipeline that's all-or-nothing —
> can't be deployed until everything is finished, which in practice means it's never deployed.

## Guardrails: making the dangerous path the loud, explicit one

Every script above can also run against the **production** database — and that's exactly the
kind of capability that deletes a livelihood one mistyped command at a time. The repo's defense
is layered:

- **Two env files, safe one by default.** `.env.local` holds dev credentials (and the *test*
  Stripe key); prod credentials live only in `.env.prod`. Nothing loads `.env.prod` implicitly.
- **The only path to prod is an explicit `:prod` wrapper**, which layers a second `--env-file`
  on top — later files win, so the prod pair overrides the dev pair:

```sh
node --env-file=.env.local --env-file=.env.prod scripts/seed.js
```

- **Every script announces its target before writing** — `Supabase target: <ref> [DEV]`, and the
  Stripe-using scripts add `Stripe target: [TEST|LIVE]` — so the blast radius is printed on the
  first line of output, where you can still Ctrl-C.
- **The destructive script has no conveniences at all.** `delete-drawing.js` has no npm wrapper,
  no dry-run, and no `:prod` variant — deleting from production means hand-assembling the double
  `--env-file` command, on purpose.

> Concept: **the pit of success — and friction as a feature.** Safety that depends on people
> remembering to be careful fails; safety that's *structural* — the safe path is the default,
> the dangerous path requires deliberate extra typing, and the system states loudly what it's
> about to do — survives tired humans. Deliberately *not* automating something (no wrapper for
> the delete script) is a valid design decision, and sometimes the best one available.
