import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
    if (!_stripe) {
        _stripe = new Stripe(env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-04-22.dahlia' as any,
        });
    }
    return _stripe;
}
