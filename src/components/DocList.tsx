/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useFileMetadata, useMetadataQuery } from '@immediately-run/sdk';
import { isContentEntry, keyToHref, slugToKey } from '../lib/content';
import InlineProse from './InlineProse';
import { queryPaths } from '../lib/wiki';
import EntryImage from './EntryImage';
import { useEntryKey } from '../hooks/useEntryKey';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';

interface Props {
  shape?: 'feed' | 'grid';
  title?: string | null;
  slugs?: string;
  tag?: string;
  limit?: string | number;
  sort?: 'date' | 'title';
  /** "infinite" — a windowed feed that grows on scroll (R3-314). A LITERAL
   *  attribute: the safe renderer copies `paginate="infinite"` verbatim but drops
   *  `paginate={mode}` silently, and the list then renders whole with nothing
   *  saying why. */
  paginate?: string;
  /** How many entries a windowed batch adds (literal string or number). */
  batch?: string | number;
}

function tagsOf(meta: any): string[] {
  return Array.isArray(meta?.tags) ? meta.tags.filter((t: string) => !t.startsWith('ui/')) : [];
}

// One entry as a feed row — reads its own frontmatter so the hook count is stable.
function Row({ path }: { path: string }) {
  const meta = useFileMetadata(path) as any;
  const from = useEntryKey();
  const follow = useFollowLink();
  if (!meta) return <div className="gdl-row"><div className="sk sk-line" style={{ width: '50%' }} /></div>;
  return (
    <Link href={keyToHref(path)} className="gdl-row" onClick={followLinkOnClick(follow, { key: path, href: keyToHref(path), from })}>
      <div>
        <div className="gdl-row__t"><InlineProse text={meta.title || path} trimPeriod /></div>
        {meta.description && <div className="gdl-row__d"><InlineProse text={meta.description} /></div>}
        <div className="gdl-row__tags">
          {tagsOf(meta).slice(0, 3).map((t) => (
            <span key={t} className="grove-tag">#{t}</span>
          ))}
        </div>
      </div>
      <div className="gdl-row__meta">{meta.date}</div>
    </Link>
  );
}

// One entry as a grid card — the entry's `cover:` when it declares one (resolved
// against the OWNING entry, R3-313 — a card must show its own picture, not the
// rendered entry's), the link-graph lattice when it does not or the asset is
// unreadable. Degrade, never break.
function CardTile({ path }: { path: string }) {
  const meta = useFileMetadata(path) as any;
  const from = useEntryKey();
  const follow = useFollowLink();
  if (!meta) return <div className="gdl-card"><div className="gdl-card__pic" /></div>;
  return (
    <Link href={keyToHref(path)} className="gdl-card" onClick={followLinkOnClick(follow, { key: path, href: keyToHref(path), from })}>
      <div className="gdl-card__pic">
        <EntryImage entryPath={path} src={meta.cover} alt="" className="gdl-card__cover" degrade={<span className="gdl-card__lattice" />} />
      </div>
      <div className="gdl-card__foot">
        <div className="gdl-card__t"><InlineProse text={meta.title || path} trimPeriod /></div>
        {meta.description && <div className="gdl-card__d"><InlineProse text={meta.description} /></div>}
        <div className="gdl-card__tags">
          {tagsOf(meta).slice(0, 3).map((t) => (
            <span key={t} className="grove-tag">#{t}</span>
          ))}
        </div>
      </div>
    </Link>
  );
}

// Import-free engine component: a frontmatter-driven index of entries, in a feed
// or grid shape. `slugs` pins an explicit ordered set; otherwise it queries the
// whole content space (optionally filtered by `tag`), excluding view/index pages.
//
// `paginate="infinite"` (R3-314): a windowed feed with an IntersectionObserver
// sentinel — the repo's other observer (useHeadings, the contents rail) is the
// pattern, and this one reuses its shape rather than inventing machinery. Three
// states beyond "rows": a skeleton batch (rows render `.sk` until their metadata
// resolves, occupying the real box so nothing shifts), a sentinel that is a
// BUTTON — reachable and actionable by keyboard alone, not only by scrolling —
// and an explicit end ("that is all N entries") rather than a list that merely
// stops. No IntersectionObserver in the environment → the full list renders;
// that degradation is the honest fallback, not an error.
export default function DocList({
  shape = 'feed',
  title,
  slugs,
  tag,
  limit,
  sort = 'date',
  paginate,
  batch,
}: Props) {
  const queryFn = useCallback(
    (fm: Record<string, any>) => {
      const keys = Object.keys(fm).filter((p) => {
        if (!isContentEntry(p)) return false;
        const m = fm[p] || {};
        if (m.view) return false;
        if (tag && !(Array.isArray(m.tags) && m.tags.includes(tag))) return false;
        return true;
      });
      keys.sort((a, b) => {
        if (sort === 'title') return (fm[a].title || a) < (fm[b].title || b) ? -1 : 1;
        return String(fm[b].date || '').localeCompare(String(fm[a].date || ''));
      });
      return keys;
    },
    [tag, sort]
  );
  const queried = useMetadataQuery(queryFn);
  const loaded = Array.isArray(queried);

  let paths: string[] = slugs
    ? slugs.split(',').map((s) => slugToKey(s.trim())).filter(Boolean)
    : queryPaths(queried);
  const n = limit ? Number(limit) : undefined;
  if (n && paths.length > n) paths = paths.slice(0, n);

  // ── the windowed feed (R3-314) ─────────────────────────────────────────────
  const windowed = paginate === 'infinite' && typeof IntersectionObserver !== 'undefined';
  const batchSize = Math.max(1, Number(batch) || 20);
  const [visible, setVisible] = useState(batchSize);
  const sentinelRef = useRef<HTMLButtonElement | null>(null);
  const more = windowed && visible < paths.length;
  const shown = windowed ? paths.slice(0, visible) : paths;

  useEffect(() => {
    if (!more) return;
    const el = sentinelRef.current;
    if (!el) return;
    // Load a little BEFORE the sentinel is fully reached, so a slow scroll never
    // sees the end of the list — same observer shape as useHeadings' scroll-spy.
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + batchSize);
      },
      { rootMargin: '0px 0px 240px 0px', threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [more, batchSize]);

  const loadMore = () => setVisible((v) => v + batchSize);

  return (
    <div className="grove-doclist-wrap">
      {title ? (
        <div className="grove-doclist__head">
          <h2>{title}</h2>
          <span className="n">{paths.length} {paths.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      ) : null}
      {!slugs && loaded && paths.length === 0 ? (
        <p className="grove-search__empty">No entries yet.</p>
      ) : (
        <div className="grove-doclist" data-shape={shape}>
          {shown.map((p: string) =>
            shape === 'grid' ? <CardTile key={p} path={p} /> : <Row key={p} path={p} />
          )}
          {more ? (
            <button
              ref={sentinelRef}
              className="gdl-sentinel"
              onClick={loadMore}
              aria-label={`Load the next ${Math.min(batchSize, paths.length - shown.length)} entries`}
            >
              <span className="sk sk-line" style={{ width: '42%' }} />
              <span className="sk sk-line" style={{ width: '68%' }} />
            </button>
          ) : null}
          {windowed && !more && paths.length > batchSize ? (
            <p className="gdl-end" role="status">That is all {paths.length} entries.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
