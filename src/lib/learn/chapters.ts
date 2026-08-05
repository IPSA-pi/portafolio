// The Learn section's table of contents. Each chapter is one Markdown file in
// the repo-root learn/ directory; this manifest is the single place that maps
// files to URLs and orders them into parts. The index page, the [chapter]
// route (including prev/next links and prerender entries), and the sitemap
// all read from here — publishing a chapter is "add the .md file, add one
// entry below."
export interface Chapter {
    slug: string; // URL segment: /learn/<slug>
    file: string; // learn/<file>.md at the repo root
    title: string;
    description: string;
}

export interface Part {
    title: string;
    chapters: Chapter[];
}

export const parts: Part[] = [
    {
        title: 'Part I — Foundations',
        chapters: [
            {
                slug: 'overview',
                file: '01-overview',
                title: 'How the site fits together',
                description:
                    'The 30-second pitch, how a request flows through the site, the folder map, and the server/client split that keeps secrets safe.'
            },
            {
                slug: 'svelte',
                file: '02-svelte',
                title: 'Svelte 5: runes and reactivity',
                description:
                    'Runes — $props, $state, $derived, $effect — plus snippets and stores, with real examples from this site’s components.'
            },
            {
                slug: 'sveltekit',
                file: '03-sveltekit',
                title: 'SvelteKit: load, hooks, and endpoints',
                description:
                    'Server load functions, hooks as middleware, API endpoints, and the seeded shuffle that ties them together.'
            }
        ]
    },
    {
        title: 'Part II — The shop',
        chapters: [
            {
                slug: 'shop',
                file: '04-shop',
                title: 'How the shop works: Stripe + Supabase',
                description:
                    'How two services split the work of selling one-of-a-kind drawings: data model, purchase flow, payment verification, safety properties, and what breaks when the same piece can also sell in person.'
            },
            {
                slug: 'cart',
                file: '05-cart',
                title: 'Building the cart: war stories',
                description:
                    'Seven real bugs from turning single-item checkout into a multi-item cart, and the general lesson inside each one.'
            }
        ]
    },
    {
        title: 'Part III — Security',
        chapters: [
            {
                slug: 'auth',
                file: '06-auth',
                title: 'Auth and cookies: the owner gate',
                description:
                    'Cookies, JWTs, and Cloudflare Access: how the site knows you’re the owner — and why a cookie being present is not a login.'
            }
        ]
    },
    {
        title: 'Part IV — Behind the scenes',
        chapters: [
            {
                slug: 'edge',
                file: '07-edge',
                title: 'Running on the edge: Cloudflare Workers',
                description:
                    'What running at the edge actually means: async-only crypto, per-request env vars, and why dev is not prod.'
            },
            {
                slug: 'pipelines',
                file: '08-pipelines',
                title: 'Data pipelines and automation',
                description:
                    'The daily scrape-and-enrich music pipeline: idempotent jobs, conservative matching, polite API clients, and guardrails around prod.'
            },
            {
                slug: 'images',
                file: '09-images',
                title: 'Images and media',
                description:
                    'Four sizes per drawing: WebP variants, srcset/sizes, lazy loading, and why the OG images stay JPG.'
            },
            {
                slug: 'meta',
                file: '10-meta',
                title: 'This page builds itself',
                description:
                    'How the Learn section renders itself: Markdown to highlighted HTML at build time, with nothing heavy shipped to the browser.'
            }
        ]
    },
    {
        title: 'Appendix',
        chapters: [
            {
                slug: 'appendix',
                file: '99-appendix',
                title: 'Glossary & further reading',
                description:
                    'Plain-English definitions for every term used in the chapters, plus where to go next.'
            }
        ]
    }
];

export const chapters: Chapter[] = parts.flatMap((p) => p.chapters);
