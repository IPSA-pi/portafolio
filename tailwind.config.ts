import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

/** Semantic token backed by a CSS custom property in app.css, with Tailwind's
 *  opacity modifier (`text-content/60`) still working. */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: 'selector',
  content: ["./src/**/*.{html,js,svelte,ts}"],

  theme: {
    extend: {
      fontFamily: {
        // UI default: technical grotesk. Carries the machine half of the site.
        sans: ['"Space Grotesk Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        // Prose voice: warm serif. Carries the hand half — descriptions,
        // tombstones, anything written rather than labelled.
        body: ['"Newsreader Variable"', 'ui-serif', 'Georgia', 'serif'],
        // Data: prices, slugs, counts, labels.
        mono: ['"Space Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        'display-lg': ['clamp(2.5rem, 6vw, 4rem)',    { lineHeight: '1.02', letterSpacing: '-0.03em',  fontWeight: '700' }],
        'display':    ['clamp(1.75rem, 4vw, 2.5rem)', { lineHeight: '1.06', letterSpacing: '-0.025em', fontWeight: '700' }],
        'title':      ['1.25rem',                     { lineHeight: '1.3',  letterSpacing: '-0.01em',  fontWeight: '500' }],
        'body':       ['1rem',                        { lineHeight: '1.65' }],
        'meta':       ['0.8125rem',                   { lineHeight: '1.4' }],
        'label':      ['0.6875rem',                   { lineHeight: '1',    letterSpacing: '0.18em' }],
      },

      colors: {
        surface: {
          DEFAULT: token('surface'),
          raised:  token('surface-raised'),
        },
        content: {
          DEFAULT: token('content'),
          dim:     token('content-dim'),
        },
        line:   token('line'),
        signal: {
          DEFAULT: token('signal'),
          strong:  token('signal-strong'),
        },
        alert:  token('alert'),

        // Legacy accent, kept verbatim for surfaces outside this pass's scope
        // (/learn, /new-music, /about, /admin). In-scope code uses `signal`.
        accent: {
          DEFAULT: '#39ff14',
          hover:   '#2de010',
        },
      },
    }
  },

  plugins: [typography]
} as Config;
