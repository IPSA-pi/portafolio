import { Marked } from 'marked';
import { createHighlighter, type Highlighter } from 'shiki';
// The teaching content lives in LEARN.md at the repo root. We import it as a raw
// string and render it to HTML here. Because this page is prerendered (below),
// all of this — including the heavy Shiki highlighter — runs once at BUILD time
// in Node, never on Cloudflare's edge and never in the browser.
import learnMd from '../../../LEARN.md?raw';

// Prerender: SvelteKit runs this load during `vite build` and bakes the result
// into a static HTML page. Nothing in this file ships to the client.
export const prerender = true;

const THEME = 'github-dark';
const LANGS = ['typescript', 'javascript', 'svelte', 'bash', 'json', 'markdown'];
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

let cachedHtml: string | null = null;

async function render(): Promise<string> {
    if (cachedHtml) return cachedHtml;

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
            // Add slug ids so the in-page table-of-contents anchors work.
            heading({ tokens, depth }) {
                const inner: string = this.parser.parseInline(tokens);
                return `<h${depth} id="${slugify(inner)}">${inner}</h${depth}>\n`;
            },
            // Repo-relative links (e.g. ./README.md) make no sense on the live site
            // and break the prerender crawler. Point them at the source on GitHub;
            // open external links in a new tab.
            link({ href, title, tokens }) {
                const inner: string = this.parser.parseInline(tokens);
                let finalHref = href;
                if (!/^https?:/.test(href) && /\.md($|#)/.test(href)) {
                    finalHref = `${REPO}/${href.replace(/^\.\//, '')}`;
                }
                const external = /^https?:/.test(finalHref);
                const attrs =
                    (title ? ` title="${title}"` : '') +
                    (external ? ' target="_blank" rel="noopener noreferrer"' : '');
                return `<a href="${finalHref}"${attrs}>${inner}</a>`;
            }
        }
    });

    cachedHtml = await marked.parse(learnMd);
    return cachedHtml;
}

export async function load() {
    return { html: await render() };
}
