import { browser } from '$app/environment';
import { writable } from 'svelte/store';

// A visitor's personal status for a release, stored per-browser in
// localStorage — the public counterpart to the owner's shared
// `releases.status` column. "Unheard" is the default and is represented by
// the absence of an entry, so the stored map only grows with actual use.
export type VisitorStatus = 'heard' | 'liked' | 'queued' | 'dismissed';

export const VISITOR_STATUSES: VisitorStatus[] = ['heard', 'liked', 'queued', 'dismissed'];

const STORAGE_KEY = 'new-music:worklist:v1';
// Pre-worklist visitors only had a "heard" checkbox persisted as an id array.
const LEGACY_HEARD_KEY = 'new-music:heard';

export type Worklist = Record<string, VisitorStatus>;

function isVisitorStatus(v: unknown): v is VisitorStatus {
    return typeof v === 'string' && (VISITOR_STATUSES as string[]).includes(v);
}

function sanitize(parsed: unknown): Worklist {
    const out: Worklist = {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [id, status] of Object.entries(parsed)) {
            if (isVisitorStatus(status)) out[id] = status;
        }
    }
    return out;
}

function getInitial(): Worklist {
    if (!browser) return {};
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return sanitize(JSON.parse(raw));
        // First run with no worklist yet: fold the legacy heard-set in. The old
        // key is left in place so a rollback doesn't lose it.
        const legacy = localStorage.getItem(LEGACY_HEARD_KEY);
        if (legacy) {
            const out: Worklist = {};
            for (const id of JSON.parse(legacy) as unknown[]) {
                if (typeof id === 'string') out[id] = 'heard';
            }
            return out;
        }
        return {};
    } catch {
        return {};
    }
}

export const musicWorklist = writable<Worklist>(getInitial());

musicWorklist.subscribe((w) => {
    if (!browser) return;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
    } catch {
        /* storage unavailable (private mode, quota) — in-memory only */
    }
});

// null clears back to the "unheard" default (removes the entry entirely).
export function setVisitorStatus(id: string, status: VisitorStatus | null) {
    musicWorklist.update((w) => {
        const next = { ...w };
        if (status === null) delete next[id];
        else next[id] = status;
        return next;
    });
}

// --- Export / import: the safety net for localStorage's fragility ---------

export function serializeWorklist(w: Worklist): string {
    return JSON.stringify({ version: 1, statuses: w }, null, 2);
}

// Accepts our export envelope or a bare status map. Returns null on anything
// unparseable; unknown statuses are dropped rather than failing the import.
export function parseWorklistFile(text: string): Worklist | null {
    try {
        const parsed = JSON.parse(text);
        const src = parsed && typeof parsed === 'object' && 'statuses' in parsed ? parsed.statuses : parsed;
        return sanitize(src);
    } catch {
        return null;
    }
}
