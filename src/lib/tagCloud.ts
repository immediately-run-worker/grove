// TagCloud's counting and scaling, extracted from the component so the cases are
// unit-testable (the component is a thin wiring shell). The chip's pixel range is
// NOT here — it lives in GroveApp.css, and the component only hands each chip a
// 0..1 weight via `--tag-weight`.

/** One tag and how many content entries carry it. */
export interface TagCount {
  tag: string;
  count: number;
}

interface TaggedMeta {
  tags?: unknown;
}

/** Every tag across the corpus with its count, sorted by tag. Only entries under
 *  the content root count; `ui/` tags are chrome (they drive layout, not
 *  classification) and are skipped. */
export function countTags(filesMetadata: Record<string, TaggedMeta | null>, contentRoot: string): TagCount[] {
  const counts: Record<string, number> = {};
  Object.entries(filesMetadata).forEach(([p, m]) => {
    if (!p.startsWith(contentRoot)) return;
    if (m && Array.isArray(m.tags)) {
      (m.tags as string[]).forEach((t) => {
        if (t.startsWith('ui/')) return;
        counts[t] = (counts[t] || 0) + 1;
      });
    }
  });
  return Object.keys(counts)
    .sort()
    .map((tag) => ({ tag, count: counts[tag]! }));
}

/** A tag's weight in the closed range 0..1: logarithmic and relative to THIS
 *  corpus's own minimum and maximum, so the scale holds at 10 entries and at
 *  10,000 — the least-used tag renders 0, the most-used 1, and a tag used ten
 *  times as often is visibly but not ten times larger. No spread (`max === min`)
 *  returns 0, so a uniform corpus renders plain chips; a count below 1 or a
 *  non-finite count returns 0. */
export function tagWeight(count: number, min: number, max: number): number {
  if (!Number.isFinite(count) || count < 1) return 0;
  if (max <= min) return 0;
  const w = (Math.log(count) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return Math.min(1, Math.max(0, w));
}

/** The `limit` most-used tags, ties at the cut broken by tag name, re-sorted by
 *  tag for display (the cloud reads alphabetically). An absent limit returns the
 *  input unchanged — validating a bad limit is the component's job (it warns). */
export function topTags(entries: TagCount[], limit?: number): TagCount[] {
  if (limit === undefined) return entries;
  return entries
    .slice()
    .sort((a, b) => b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
    .slice(0, limit)
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}
