# This page builds itself

The chapter you're reading is a Markdown file — `learn/10-meta.md`, sitting in the repo next to
the code it describes. There's no CMS, no admin editor, no database of posts. This chapter
explains the machinery that turns those files into the pages you're browsing, because it's a
compact tour of an idea that organizes the whole site: *the earliest possible moment a piece of
work can happen is usually the best place to do it.*

## Three times code can run

Any piece of a web app runs at one of three moments:

1. **Build time** — once, on the build machine, when `npm run build` runs.
2. **Request time** — on the server (here, [a Cloudflare Worker](/learn/edge)), every time
   someone asks for a URL.
3. **Client time** — in the visitor's browser, after the page arrives.

Rendering Markdown is deterministic — the same file always produces the same HTML — so doing it
at request time would repeat identical work for every visitor, and doing it in the browser would
ship a Markdown parser and a syntax highlighter to everyone. The right moment is build time,
once. SvelteKit calls this **prerendering**:

```ts
// src/routes/learn/[chapter]/+page.server.ts
export const prerender = true;
```

With that flag, the page's `load` function runs during `vite build`, in Node, and its output is
baked into static HTML. Nothing in the rendering pipeline — the parser, the highlighter, the
Markdown itself — ever ships to the browser or runs at the edge.

## The rendering pipeline

The renderer (`src/lib/server/learn.ts`) uses two libraries: **marked** parses Markdown into
tokens, and **Shiki** — the same highlighting engine VS Code uses — colors the code blocks.
Shiki is exactly the kind of dependency you want at build time only: it loads full TextMate
grammars and is far too heavy to send to a browser, but at build time its cost is paid once,
by the build machine.

The integration pre-highlights every code block while marked walks its token tree, then swaps
the highlighted HTML in through a custom renderer:

```ts
marked.use({
    walkTokens(token) {
        if (token.type === 'code') {
            const lang = token.lang && loaded.has(token.lang) ? token.lang : 'text';
            token.text = highlighter.codeToHtml(token.text, { lang, theme: THEME });
        }
    },
    renderer: {
        code({ text }) { return text; },   // already a full <pre class="shiki"> block
        heading({ tokens, depth }) {
            const inner = this.parser.parseInline(tokens);
            return `<h${depth} id="${slugify(inner)}">${inner}</h${depth}>\n`;
        }
    }
});
```

The custom `heading` renderer gives every heading a URL-friendly `id`, which is what makes
in-page anchors like `#three-times-code-can-run` work. A third override rewrites repo-relative
links (like `../README.md`) to point at the file on GitHub — a link that makes sense in the
repo would otherwise 404 on the live site.

## Chapters as data

The Learn section doesn't have one route per chapter written by hand. There's a single dynamic
route, `src/routes/learn/[chapter]/`, plus a manifest describing every chapter — its URL slug,
source file, title, and which part it belongs to. The Markdown sources are pulled in with Vite's
`import.meta.glob`, which imports every file matching a pattern:

```ts
// src/lib/server/learn.ts
const sources = import.meta.glob('/learn/*.md', {
    query: '?raw', import: 'default', eager: true
}) as Record<string, string>;
```

Dropping a new `.md` file into `learn/` and adding one line to the manifest is the entire
process for publishing a chapter — the index page, the chapter page, its prev/next links, and
the sitemap all read the same manifest.

One wrinkle: a prerenderer can only bake URLs it knows exist, and `/learn/[chapter]` matches
infinitely many. The `entries` export closes that gap by enumerating the real ones:

```ts
export function entries() {
    return chapters.map((c) => ({ chapter: c.slug }));
}
```

At build time SvelteKit calls it, gets the list of slugs, and prerenders each chapter page.

> Concept: **content as data, and build-time work as the cheapest work.** Treating pages as
> data (files + a manifest) instead of code (a route per page) makes adding content trivial;
> prerendering makes serving it free. And there's a pleasing recursion at the bottom of it:
> editing this very file triggers the pipeline it documents — the build reads the chapter about
> the build, and the page describing prerendering is itself prerendered.
