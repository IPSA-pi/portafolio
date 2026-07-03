import { browser } from '$app/environment';
import { derived, writable } from 'svelte/store';

export type CartItem = {
    slug: string;
    notebook: string;
    price: number; // cents, display snapshot — the server re-derives real prices at checkout
    image: string;
};

const STORAGE_KEY = 'cart:v1';

// Matches /api/checkout's MAX_ITEMS — a 21st item could never check out anyway.
export const MAX_CART_ITEMS = 20;

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

// Returns false (no-op) when the cart is already at MAX_CART_ITEMS and this
// would be a genuinely new item; true otherwise (added, or already present).
export function addToCart(item: CartItem): boolean {
    let added = true;
    cartItems.update((items) => {
        if (items.some((i) => i.slug === item.slug)) return items;
        if (items.length >= MAX_CART_ITEMS) {
            added = false;
            return items;
        }
        return [...items, item];
    });
    return added;
}

export function removeFromCart(slug: string) {
    cartItems.update((items) => items.filter((i) => i.slug !== slug));
}

export function clearCart() {
    cartItems.set([]);
}

export const cartCount = derived(cartItems, (items) => items.length);
export const cartTotal = derived(cartItems, (items) => items.reduce((sum, i) => sum + i.price, 0));
