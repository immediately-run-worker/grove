import { useCallback, useEffect, useRef } from 'react';
import { useHeadings, useActiveHeading } from '../hooks/useHeadings';
import { measure, scrollOffsetFor } from '../lib/tocScroll';

interface Props {
  /** Re-scan when the rendered entry changes. */
  entryKey?: string;
  /** Heading above the list; `null`/`""` renders none. */
  title?: string | null;
  /** Extra class on the `<nav>` — how `<Toc>` keeps its rail styling. */
  className?: string;
}

/** Breathing room kept between the active entry and the edge it is pulled away from. One
 *  row's worth: an entry flush against the fold reads as "the last one", and the margin is
 *  what tells the reader the list continues. */
const EDGE_MARGIN = 28;

/** How long a manual scroll of the list suppresses the automatic one. Without this the
 *  reader who scrolls the contents to look ahead is yanked back on the next heading the
 *  DOCUMENT passes — the list fighting the hand that moved it. */
const MANUAL_SCROLL_GRACE_MS = 2000;

/**
 * `<TableOfContents/>` — the on-this-page list, which **keeps the current entry in view**.
 *
 * A long entry has a long contents list, and a list taller than its rail scrolls. Without
 * this the reader scrolls into §12 and the contents still shows §1–§9 with nothing
 * highlighted: the one surface whose whole job is "where am I" stops answering exactly
 * when the document is long enough to need it.
 *
 * Three things it deliberately does NOT do:
 *
 * - **It never scrolls the page.** `scrollIntoView()` walks every scrollable ancestor, so
 *   the obvious implementation moves the document too — the reader passes a heading and
 *   the article jumps. This assigns `scrollTop` on its OWN container and nothing else can
 *   move (`lib/tocScroll`).
 * - **It does not scroll when the entry is already visible.** Otherwise the list twitches
 *   on every heading the reader passes.
 * - **It does not fight the reader.** A manual scroll of the list suspends the automatic
 *   one briefly.
 */
export default function TableOfContents({ entryKey, title = 'On this page', className }: Props) {
  const heads = useHeadings(entryKey);
  const cur = useActiveHeading(heads, entryKey);
  const listRef = useRef<HTMLElement | null>(null);
  const itemsRef = useRef(new Map<string, HTMLAnchorElement>());
  const manualUntilRef = useRef(0);

  const noteManualScroll = useCallback(() => {
    manualUntilRef.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const item = cur ? itemsRef.current.get(cur) : undefined;
    if (!list || !item) return;
    if (Date.now() < manualUntilRef.current) return;
    const offset = scrollOffsetFor(...measure(list, item), { margin: EDGE_MARGIN });
    if (offset === null) return; // already in view — "when necessary"
    // `scroll()` on the element, never `scrollIntoView()` on the item: only this container
    // may move. Motion is opt-out — a reader who asked the OS for less of it gets a jump.
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    list.scrollTo({ top: offset, behavior: reduced ? 'auto' : 'smooth' });
  }, [cur]);

  if (!heads.length) return null;

  return (
    <nav
      ref={listRef}
      className={['grove-toc', className].filter(Boolean).join(' ')}
      aria-label={title || 'On this page'}
      onWheel={noteManualScroll}
      onTouchMove={noteManualScroll}
    >
      {title ? <div className="grove-toc__h">{title}</div> : null}
      {heads.map((h) => (
        <a
          key={h.id}
          ref={(el) => {
            if (el) itemsRef.current.set(h.id, el);
            else itemsRef.current.delete(h.id);
          }}
          href={`#${h.id}`}
          data-cur={cur === h.id ? '1' : '0'}
          aria-current={cur === h.id ? 'location' : undefined}
          className={h.level === 3 ? 'lvl3' : undefined}
          onClick={(e) => {
            e.preventDefault();
            // Clicking IS the reader moving the list, so don't also auto-scroll it.
            noteManualScroll();
            document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}
