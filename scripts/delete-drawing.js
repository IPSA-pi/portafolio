/**
 * Delete one or more drawings and all their storage variants from Supabase.
 *
 * Removes rows from the drawings table and deletes the 4 storage files per
 * drawing (original + sm, md, lg variants) from the drawings bucket.
 *
 * Usage:
 *   node --env-file=.env.local scripts/delete-drawing.js <slug> [slug2 slug3 ...]
 *
 * Example:
 *   node --env-file=.env.local scripts/delete-drawing.js negro_2_09 negro_2_10 negro_2_11
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { logDbTarget } from './db-target.js';

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
    console.error('Usage: node --env-file=.env.local scripts/delete-drawing.js <slug> [slug2 slug3 ...]');
    process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
logDbTarget(SUPABASE_URL);
const BUCKET = 'drawings';

// Validate all slugs up front before touching anything
const entries = slugs.map(slug => {
    const notebook = slug.match(/^(.+)_\d{2}$/)?.[1];
    if (!notebook) {
        console.error(`Could not parse notebook from slug "${slug}". Expected format: {notebook}_{dd}`);
        process.exit(1);
    }
    return { slug, notebook };
});

const allStoragePaths = entries.flatMap(({ slug, notebook }) => [
    `${notebook}/${slug}.webp`,
    `${notebook}/${slug}-sm.webp`,
    `${notebook}/${slug}-md.webp`,
    `${notebook}/${slug}-lg.webp`,
]);

console.log(`Deleting ${slugs.length} drawing(s):`);
console.log(slugs.map(s => `  ${s}`).join('\n'));
console.log(`\nStorage files (${allStoragePaths.length}):`);
console.log(allStoragePaths.map(p => `  ${p}`).join('\n'));
console.log();

// 1. Delete all storage files in one call
const { data: removed, error: storageError } = await supabase.storage
    .from(BUCKET)
    .remove(allStoragePaths);

if (storageError) {
    console.error('Storage deletion failed:', storageError.message);
    process.exit(1);
}
console.log(`Storage: deleted ${removed?.length ?? 0} file(s)`);

// 2. Delete all database rows in one call
const { error: dbError } = await supabase
    .from('drawings')
    .delete()
    .in('slug', slugs);

if (dbError) {
    console.error('Database deletion failed:', dbError.message);
    process.exit(1);
}
console.log(`Database: deleted ${slugs.length} row(s)`);
console.log('\nDone.');
