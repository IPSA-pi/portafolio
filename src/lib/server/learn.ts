import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';

// Every Learn chapter, imported as a raw Markdown string. The leading '/'
// makes the glob project-root-relative, so it reaches the repo-root learn/
// directory (outside src/). Because every consumer of this module is
// prerendered, all of this — including the heavy Shiki highlighter below —
// runs once at BUILD time in Node, never on Cloudflare's edge and never in
// the browser.
const sources = import.meta.glob('/learn/*.md', {
    query: '?raw',
    import: 'default',
    eager: true
}) as Record<string, string>;

const THEME = 'github-dark';
const LANGS = ['typescript', 'javascript', 'svelte', 'bash', 'json', 'markdown', 'yaml', 'sql'];
const REPO = 'https://github.com/IPSA-pi/portafolio/blob/main';

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighter({ themes: [THEME], langs: LANGS });
    }
    return highlighterPromise;
}

function slugify(text: string): string {
    return text
        .replace(/<[^>]+>/g, '')          // strip any inline HTML tags
        .toLowerCase()
        .replace(/[^\w]+/g, '-')          // non-word runs → single dash
        .replace(/^-+|-+$/g, '');         // trim leading/trailing dashes
}

const rendered = new Map<string, string>();

/** Render one chapter file (e.g. "04-shop") to HTML, memoized per file. */
export async function renderChapter(file: string): Promise<string | null> {
    const md = sources[`/learn/${file}.md`];
    if (md === undefined) return null;

    const cached = rendered.get(file);
    if (cached) return cached;

    const highlighter = await getHighlighter();
    const loaded = new Set(highlighter.getLoadedLanguages());

    const marked = new Marked({ gfm: true, async: true });

    // Pre-highlight every fenced code block with Shiki during token walking, then
    // emit the result verbatim from the code renderer.
    marked.use({
        walkTokens(token) {
            if (token.type === 'code') {
                const lang = token.lang && loaded.has(token.lang) ? token.lang : 'text';
                token.text = highlighter.codeToHtml(token.text, { lang, theme: THEME });
                // mark so our renderer knows it's already-safe HTML
                (token as { escaped?: boolean }).escaped = true;
            }
        },
        renderer: {
            // token.text is already a full <pre class="shiki">…</pre> block
            code({ text }) {
                return text;
            },
            // Add slug ids so in-page anchors work.
            heading({ tokens, depth }) {
                const inner: string = this.parser.parseInline(tokens);
                return `<h${depth} id="${slugify(inner)}">${inner}</h${depth}>\n`;
            },
            // Repo-relative links (e.g. ../README.md) make no sense on the live
            // site and break the prerender crawler. Point them at the source on
            // GitHub; open external links in a new tab.
            link({ href, title, tokens }) {
                const inner: string = this.parser.parseInline(tokens);
                let finalHref = href;
                if (!/^https?:/.test(href) && /\.md($|#)/.test(href)) {
                    finalHref = `${REPO}/${href.replace(/^(?:\.\.?\/)+/, '')}`;
                }
                const external = /^https?:/.test(finalHref);
                const attrs =
                    (title ? ` title="${title}"` : '') +
                    (external ? ' target="_blank" rel="noopener noreferrer"' : '');
                return `<a href="${finalHref}"${attrs}>${inner}</a>`;
            }
        }
    });

    const html = await marked.parse(md);
    rendered.set(file, html);
    return html;
}
