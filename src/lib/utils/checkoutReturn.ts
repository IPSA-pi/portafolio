import { replaceState } from '$app/navigation';

const PENDING_KEY = 'pending-checkout';

// Remember the session we're about to send the buyer to Stripe for. If they
// come back without hitting the cancel_url (Back button, closed tab), this
// is how handleCheckoutReturn still finds the session to release.
export function setPendingCheckout(sessionId: string) {
    try {
        sessionStorage.setItem(PENDING_KEY, sessionId);
    } catch {
        /* storage unavailable — best effort only */
    }
}

// Call on a confirmed success landing — payment went through, there is
// nothing to release, just forget the pending marker.
export function clearPendingCheckout() {
    try {
        sessionStorage.removeItem(PENDING_KEY);
    } catch {
        /* ignore */
    }
}

function getPendingCheckout(): string | null {
    try {
        return sessionStorage.getItem(PENDING_KEY);
    } catch {
        return null;
    }
}

// Detects a return from Stripe Checkout that wasn't a confirmed purchase —
// either the explicit ?canceled=true&session_id=… redirect, or, when the
// buyer used Back/closed the tab and never hit that URL, a pending-checkout
// marker left in sessionStorage by setPendingCheckout — and releases the
// reservation via /api/checkout/cancel.
//
// Safe to call unconditionally on mount: the cancel endpoint (see
// src/lib/server/reservations.ts) refuses to touch a paid session or a
// reservation newer than the session it's given, so a spurious call here
// (e.g. no pending checkout at all) is a no-op.
export async function handleCheckoutReturn(url: URL): Promise<boolean> {
    const params = url.searchParams;
    const paramSessionId = params.get('canceled') === 'true' ? params.get('session_id') : null;
    const sessionId = paramSessionId ?? getPendingCheckout();

    if (!sessionId) return false;

    try {
        await fetch('/api/checkout/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
        });
    } catch (e) {
        console.error('Error releasing canceled reservation:', e);
    }

    clearPendingCheckout();

    if (paramSessionId) {
        const stripped = new URL(url);
        stripped.searchParams.delete('canceled');
        stripped.searchParams.delete('session_id');
        replaceState(stripped, {});
    }

    return true;
}
