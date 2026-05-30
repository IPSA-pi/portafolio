import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    let seed = Number(event.cookies.get('session_seed'));
    if (!seed) {
        seed = Math.floor(Math.random() * 2 ** 32);
        event.cookies.set('session_seed', String(seed), {
            path: '/',
            sameSite: 'lax',
            httpOnly: false,
            // no maxAge — session cookie, expires when browser closes
        });
    }
    event.locals.sessionSeed = seed;
    return resolve(event);
};
