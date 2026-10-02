// The terms attached to every digital copy of a drawing — the one free with a
// physical purchase, and (later) the one sold on its own.
//
// One constant, two display sites: the purchase-confirmation email
// (src/routes/api/webhook/+server.ts) and the /terms page. They must say the
// same thing, so the legal page can never drift from what a buyer was actually
// shown at purchase.
//
// Plain text, no markup — the email escapes it into HTML and /terms renders it
// as a paragraph.

export const DIGITAL_LICENSE =
    'Personal use. Print it for your own home or office, and share the image on ' +
    'personal social media with credit. Please don’t resell it, redistribute the ' +
    'file, use it commercially, or put it on merchandise. Copyright stays with the ' +
    'artist.';

// What the buyer actually receives, stated once so the email and /terms agree.
// Deliberately makes no claim of exclusive resolution: the gallery's -lg variant
// is a re-encode at native resolution, so these are not pixels unavailable
// elsewhere. What the file adds is losslessness, a print-ready density tag, a
// named colour profile, and the licence above.
export const DIGITAL_FILE_DESCRIPTION =
    'a lossless PNG at full scan resolution (around 1640 × 2530 pixels, tagged ' +
    '600 DPI), which prints cleanly at postcard size and enlarges to roughly A5 at ' +
    '300 DPI';
