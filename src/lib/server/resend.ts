import { Resend } from 'resend';
import { env } from '$env/dynamic/private';

let _resend: Resend | null = null;

export function getResend(): Resend {
    if (!_resend) {
        // Same reasoning as getStripe(): name the missing variable here rather
        // than letting `new Resend(undefined)` surface as an opaque auth
        // failure at send time. The webhook already treats a failed send as
        // non-fatal (the sale is recorded either way) and logs it.
        if (!env.RESEND_API_KEY) {
            throw new Error('RESEND_API_KEY must be set');
        }
        _resend = new Resend(env.RESEND_API_KEY);
    }
    return _resend;
}
