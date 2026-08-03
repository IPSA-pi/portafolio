// Content for the public /about page. Plain data in source — edit it here,
// preview it privately, then publish by flipping the flag below and pushing.
//
// While ABOUT_PUBLISHED is false, /about 404s for everyone except you (the
// Cloudflare Access cookie is domain-wide, so `locals.isAdmin` is true across
// the whole site once you've signed in at /admin). See src/routes/about/.

/**
 * Flip to true and push to main to make /about public. Cloudflare's Git
 * integration deploys the change; this also un-hides the nav/footer links and
 * adds the page to the sitemap.
 */
export const ABOUT_PUBLISHED = false;

export type AboutContent = {
    name: string;
    role: string;
    location: string;
    /** One string per paragraph. */
    bio: string[];
    email: string;
    /** Instagram handle without the leading '@'; the URL is derived. */
    instagram: string;
    /** Short line under the contact list. Blank hides it. */
    contactNote: string;
};

// ---------------------------------------------------------------------------
// EDIT ME
// ---------------------------------------------------------------------------
export const ABOUT: AboutContent = {
    name: 'Ian Sebelius',
    role: 'Artist',
    location: 'Victoria, B.C., Canada',

    // One entry per paragraph.
    bio: [
        `TODO: Opening paragraph. Who you are and what you make — a sentence or
         two that would work as an intro anywhere. For example: where you're
         based, the medium you work in, and what the drawings are about.`,
        `TODO: Second paragraph. The practice itself — how you work, what a
         notebook page becomes, why the originals are sold one at a time
         rather than reproduced.`,
        `TODO: Third paragraph (optional). Background, training, exhibitions,
         other work — or cut this and keep the page to two paragraphs.`,
    ],

    email: 'sebeliusancira@gmail.com',
    instagram: 'yourhandle', // TODO: replace with the real handle, no '@'
    contactNote: `For commissions, shipping questions, or an order you've already placed, email is the fastest way to reach me.`,
};
