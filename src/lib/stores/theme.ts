import { browser } from '$app/environment';
import { writable } from 'svelte/store';

type Theme = 'light' | 'dark';

const defaultValue: Theme = 'dark';
const initialValue = browser ? (window.localStorage.getItem('theme') as Theme) ?? defaultValue : defaultValue;

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
