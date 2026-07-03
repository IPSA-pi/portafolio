import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';

export type CartItem = {
    slug: string;
    notebook: string;
    price: number; // cents, display snapshot — the server re-derives real prices at checkout
    image: string;
};

const STORAGE_KEY = 'cart:v1';

function getInitialItems(): CartItem[] {
    if (!browser) return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export const cartItems = writable<CartItem[]>(getInitialItems());

cartItems.subscribe((items) => {
    if (!browser) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
        /* storage unavailable (private mode, quota) — in-memory only */
    }
});

export function addToCart(item: CartItem) {
    cartItems.update((items) => (items.some((i) => i.slug === item.slug) ? items : [...items, item]));
}

export function removeFromCart(slug: string) {
    cartItems.update((items) => items.filter((i) => i.slug !== slug));
}

export function clearCart() {
    cartItems.set([]);
}

export const cartCount = derived(cartItems, (items) => items.length);
export const cartTotal = derived(cartItems, (items) => items.reduce((sum, i) => sum + i.price, 0));
