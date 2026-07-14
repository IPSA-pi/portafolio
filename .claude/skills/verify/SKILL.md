---
name: verify
description: How to build, launch, and drive this SvelteKit app for runtime verification (headless browser included).
---

# Verifying changes in this repo

## Launch

```bash
npm run dev > /path/to/scratch/dev.log 2>&1 &   # Vite on http://localhost:5173
sleep 6 && curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/
```

No env vars needed for public pages (clock, text2binary, static pages).
Shop/checkout/admin flows need `.env.local` (Supabase/Stripe keys) — already
present locally; `ADMIN_DEV_BYPASS=1` unlocks `/admin`.

## Driving pages in a headless browser

Playwright is NOT a project dep. Working recipe:

1. In a scratch dir: `npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install playwright-core`
2. Browser binary (already cached):
   `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`
   (the full `chromium-1228` build is at `chrome-linux64/chrome`, note **linux64** not linux)
3. **Gotcha:** both binaries fail with `libnspr4.so: cannot open shared object file`
   — libnss3/libnspr4 are not installed system-wide. Fix without sudo:
   ```bash
   mkdir libs && cd libs && apt-get download libnspr4 libnss3
   for d in *.deb; do dpkg-deb -x "$d" extracted/; done
   ```
   then run node with
   `LD_LIBRARY_PATH="$PWD/libs/extracted/usr/lib/x86_64-linux-gnu:$PWD/libs/extracted/usr/lib/x86_64-linux-gnu/nss"`.
4. `chromium.launch({ executablePath: exe, headless: true })` then drive normally
   (page.goto, locator.type, page.screenshot).

## Flows worth driving

- `/` — binary clock renders/animates (regression check for `$lib/utils/toBits` consumers)
- `/text2binary` — type text, assert per-byte rows via computed backgroundColor of the
  squares inside `[role="img"]`; settings panel opens via the gear button or clicking output
- Nav links live in `navLinks` in `src/routes/+layout.svelte`; sitemap at `/sitemap.xml`
