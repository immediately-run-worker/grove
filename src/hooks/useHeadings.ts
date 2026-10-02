// The rendered entry's headings, and which one the reader is in.
//
// Extracted from `<Toc>` when `<TableOfContents>` arrived, so the two surfaces cannot
// disagree about what a heading is — the drift ENGINE_BOUNDARY §4 exists to prevent. The
// scan reads the DOM rather than the source because an entry is rendered through
// `<Include>` (compiled MDX) or the safe renderer; neither hands back a heading list, and
// the ids a citation lands on are the ones actually in the document.

import { useEffect, useState } from 'react';
import { headingId } from '../lib/wiki';

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/** Heading text WITHOUT the kernel's autolink anchor. The SDK's HeadingAnchor (§15.4)
 *  prepends `<a class="ir-heading-anchor">#</a>` as the first child, so `textContent`
 *  alone would put a stray `#` in every label and in the id fallback. */
function headingText(node: Element): string {
  const anchor = node.querySelector('.ir-heading-anchor');
  if (!anchor) return (node.textContent || '').trim();
  return Array.from(node.childNodes)
    .filter((c) => c !== anchor)
    .map((c) => c.textContent ?? '')
    .join('')
    .trim();
}

/**
 * Scan the entry's body for `h2`/`h3`, assigning the canonical id to any heading the
 * kernel did not emit one for, and re-scan as the prose mounts or swaps on navigation.
 *
 * R3-872 (APP_CUSTOMIZATION §4.5): the scan is scoped to the ENTRY's marked body
 * (`[data-entry="<entryKey>"]` — emitted on both render paths), never the whole
 * document: on a multi-entry page the first `.grove-prose` is whichever entry mounted
 * first, and its headings are the wrong entry's. Unscoped (no key, or no marked body
 * anywhere) falls back to the document — the pre-marker behavior, for content that
 * never renders through the marked paths.
 */
export function useHeadings(entryKey?: string): Heading[] {
  const [heads, setHeads] = useState<Heading[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHeads([]);
    // The scan root: this entry's marked body when markers exist; the document only
    // when NO body is marked at all (the pre-marker world). A page with markers but
    // none for this key (the body is still compiling) scans nothing — the observer
    // watches the DOCUMENT until this entry's marker lands, then re-scopes (a
    // late-committing entry's ToC must not stay empty for the mount's lifetime).
    // NOTE: the marker sits INSIDE `.grove-prose` (both render paths), so the
    // scoped query runs over the marker's own subtree — searching the marker FOR
    // '.grove-prose' would find nothing (review round 1, G-CUST-2 regression).
    const markedRoot = (): HTMLElement | null =>
      entryKey === undefined
        ? null
        : Array.from(document.querySelectorAll<HTMLElement>('[data-entry]')).find(
            (n) => n.getAttribute('data-entry') === entryKey,
          ) ?? null;
    const anyMarked = () => document.querySelectorAll('[data-entry]').length > 0;
    const root = (): ParentNode | null => {
      const marked = markedRoot();
      if (marked) return marked;
      if (entryKey === undefined) return document;
      return anyMarked() ? null : document;
    };
    const scan = () => {
      const r = root();
      // Scoped: the marker's subtree holds the entry's headings. Unscoped (no
      // markers anywhere): the document's `.grove-prose`, as before.
      const nodes = !r
        ? []
        : r === document
          ? (() => {
              const prose = document.querySelector('.grove-prose');
              return prose ? Array.from(prose.querySelectorAll('h2, h3')) : [];
            })()
          : Array.from(r.querySelectorAll('h2, h3'));
      const found: Heading[] = nodes.map((n) => {
        const text = headingText(n);
        // Prefer the kernel-emitted id (§15.5); `headingId` reproduces the same canon
        // (`@immediately-run/mdx-plugins`) for a heading that has none.
        const id = n.id || headingId(text);
        n.id = id;
        return { id, text, level: n.tagName === 'H3' ? 3 : 2 };
      });
      // Identity-stable when nothing changed: this runs from a MutationObserver, and a
      // fresh array every mutation would re-run every downstream effect (the spy, the
      // scroll) on each keystroke of an editor-driven re-render.
      setHeads((prev) =>
        prev.length === found.length && prev.every((h, i) => h.id === found[i].id) ? prev : found
      );
    };
    // Observe the SCOPED root when it exists; while our marker is absent (the
    // body still compiling), observe the DOCUMENT so the marker's arrival
    // triggers the rescan that re-scopes — then move the observer onto the
    // marker (a whole-document watch would re-scan on every mutation anywhere,
    // the churn the identity guard exists to absorb).
    let observing: ParentNode | null = null;
    const obs = new MutationObserver(() => {
      const wanted = root() ?? document;
      if (wanted !== observing) {
        obs.disconnect();
        obs.observe(wanted, { childList: true, subtree: true });
        observing = wanted;
      }
      scan();
    });
    observing = root() ?? document;
    obs.observe(observing, { childList: true, subtree: true });
    scan();
    // `<Include>` resolves asynchronously, and the observer only fires if `.grove-prose`
    // already existed — these catch the window where it did not.
    const timers = [120, 300, 600].map((d) => setTimeout(scan, d));
    return () => {
      obs.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [entryKey]);

  return heads;
}

/** Which heading the reader is currently in — scroll-spied. R3-872: scoped to the
 *  entry's marked body when a key is given — duplicate section ids across entries on
 *  one page are the norm (every spec numbers from 1), and `document.getElementById`
 *  would return the FIRST entry's heading, spying on the wrong entry. */
export function useActiveHeading(heads: Heading[], entryKey?: string): string {
  const [cur, setCur] = useState<string>('');

  useEffect(() => {
    if (!heads.length) return;
    const scope: ParentNode =
      entryKey === undefined
        ? document
        : Array.from(document.querySelectorAll<HTMLElement>('[data-entry]')).find(
            (n) => n.getAttribute('data-entry') === entryKey,
          ) ?? document;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setCur((visible[0].target as HTMLElement).id);
      },
      { rootMargin: '-64px 0px -70% 0px', threshold: 0 }
    );
    heads.forEach((h) => {
      // find the element INSIDE the scope (a heading id is only unique per entry)
      const el = scope === document ? document.getElementById(h.id) : scope.querySelector(`#${CSS.escape(h.id)}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [heads, entryKey]);

  return cur;
}
