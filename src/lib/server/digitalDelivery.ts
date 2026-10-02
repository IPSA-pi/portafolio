import { getSupabase } from '$lib/server/supabase';
import { DIGITAL_LICENSE, DIGITAL_FILE_DESCRIPTION } from '$lib/digitalLicense';

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// One purchased drawing as the emails present it: the slug (for subjects), the
// display title — the drawing's own title, or the bare slug exactly as these
// emails printed before metadata existed — and its tombstone, '' when the row
// has no metadata.
// `downloadUrl` is the signed link to the free high-resolution copy that ships
// with every physical purchase — absent when the drawing has no master on file
// (two of the current drawings don't), in which case the email simply carries no
// download section.
export type EmailItem = { slug: string; title: string; tombstone: string; downloadUrl?: string };

// A year. Supabase takes an arbitrary number of seconds, and the alternative to
// a long window is a support burden: a buyer who comes back to a dead link has
// to email and wait. Long enough that they won't, short enough to still be a
// link rather than a permanent public URL.
export const DOWNLOAD_URL_TTL_SECONDS = 365 * 24 * 60 * 60;

/**
 * Mint one signed download URL per drawing that has a master on file.
 *
 * Every failure mode here is non-fatal by design. The product is the original
 * drawing; the file rides along as a bonus, and a sale that is already recorded
 * must never 500 because a bonus link couldn't be signed. Callers get whatever
 * subset succeeded.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signDownloads(rows: any[], ttlSeconds: number): Promise<Map<string, string>> {
    const urls = new Map<string, string>();
    const withMasters = rows.filter((d) => d.digital_object_path);
    if (withMasters.length === 0) return urls;

    for (const d of withMasters) {
        try {
            const { data, error: signError } = await getSupabase()
                .storage
                .from('drawings-masters')
                .createSignedUrl(d.digital_object_path, ttlSeconds);

            if (signError || !data?.signedUrl) {
                console.error(`Could not sign download for ${d.slug}:`, signError?.message ?? 'no url returned');
                continue;
            }
            urls.set(d.slug, data.signedUrl);
        } catch (e) {
            console.error(`Signing threw for ${d.slug}:`, e);
        }
    }
    return urls;
}

// The free high-resolution copy. Rendered only for the drawings that actually
// have one — a mixed cart shows links for the ones that do and says nothing
// about the rest, rather than advertising a file that isn't coming.
export function buildDownloadSection(items: EmailItem[]): string {
    const withFiles = items.filter((i) => i.downloadUrl);
    if (withFiles.length === 0) return '';

    const plural = withFiles.length > 1;
    const links = withFiles
        .map(
            (i) =>
                `<p style="margin:0 0 10px;"><a href="${escapeHtml(i.downloadUrl!)}" style="font-size:16px;color:#111;">Download ${escapeHtml(i.title)}</a></p>`
        )
        .join('');

    return `
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;border-top:1px solid #eee;">
            <tr><td style="padding-top:32px;">
              <p style="font-size:16px;color:#444;line-height:1.7;margin:0 0 16px;">
                <strong>Your digital ${plural ? 'copies are' : 'copy is'} ready.</strong>
                Included free with your purchase: ${escapeHtml(DIGITAL_FILE_DESCRIPTION)}.
              </p>
              ${links}
              <p style="font-size:13px;color:#999;line-height:1.6;margin:16px 0 0;">
                ${escapeHtml(DIGITAL_LICENSE)}
              </p>
              <p style="font-size:13px;color:#999;line-height:1.6;margin:10px 0 0;">
                ${plural ? 'These links work' : 'This link works'} for one year. If ${plural ? 'they stop' : 'it stops'} working, just reply to this email and I'll send ${plural ? 'them' : 'it'} again.
              </p>
            </td></tr>
          </table>`;
}
