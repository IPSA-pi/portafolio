import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        // Fail loudly and by name. Nothing can catch a missing secret earlier:
        // it lives in the Cloudflare dashboard, not the build, and
        // $env/dynamic/private only resolves inside a request. Without this,
        // an unset key constructs a client that fails deep inside a Stripe
        // call, mid-checkout, with a message that names neither the variable
        // nor this app.
        if (!env.STRIPE_SECRET_KEY) {
            throw new Error('STRIPE_SECRET_KEY must be set');
        }
        _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: '2026-04-22.dahlia' as any,
        });
    }
    return _stripe;
}
