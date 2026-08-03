import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type Theme = 'light' | 'dark';

function getInitialTheme(): Theme {
    if (!browser) return 'dark';
    const stored = window.localStorage.getItem('theme') as Theme | null;
    if (stored) return stored;
    // Mobile defaults to dark regardless of the OS setting; desktop follows
    // prefers-color-scheme. Mirrors the inline no-flash script in src/app.html.
    const prefersDark =
        window.matchMedia('(max-width: 767px)').matches ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
}

const initialValue = getInitialTheme();

export const theme = writable<Theme>(initialValue);

theme.subscribe((value) => {
    if (browser) {
        window.localStorage.setItem('theme', value);
        if (value === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }
});
