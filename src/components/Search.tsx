import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useMetadataQuery } from '@immediately-run/sdk';
import type { Metadata } from '@immediately-run/sdk';
import { keyToHref } from '../lib/content';
import { crumb } from '../lib/wiki';
import { useOverlayFocusDismiss } from '../hooks/useOverlayFocusDismiss';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import InlineProse from './InlineProse';
import { matchesQuery, searchQuery, toSearchEntries } from '../lib/queries';
import type { SearchRecord } from '../lib/queries';
import Icon from './Icon';

interface Hit {
  key: string;
  title: string;
  ns: string;
}

let searchListSeq = 0;

// `.grove-search` — the ⌘K command palette: client-side fuzzy filter over the
// in-memory index, grouped into entries + tags, keyboard-navigable. The input
// carries combobox semantics (aria-activedescendant tracks the highlight the
// filter maintains) and the box the dialog contract via the shared overlay
// hook (focus in, trap, Escape, focus return — R3-608).
export default function Search({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useOverlayFocusDismiss(true, onClose);
  const listId = useMemo(() => `grove-search-list-${++searchListSeq}`, []);

  // Records, not tab-encoded paths (R3-276a): `tags` is the array itself, so the
  // join/split round-trip is gone.
  const q = useMetadataQuery<Metadata, SearchRecord>(searchQuery);
  const rows: SearchRecord[] = Array.isArray(q) ? q : [];

  const rowsKey = rows.map((r) => r.path).join('|');
  const { entries, tags } = useMemo(() => {
    const es = rows.map(({ path, title, desc, tags: entryTags }) => {
      const entry = toSearchEntries([{ path, title, desc }])[0]!;
      return { ...entry, tags: entryTags.join(',') };
    });
    const tagSet = new Set<string>();
    es.forEach((e) => e.tags.split(',').filter(Boolean).forEach((t) => tagSet.add(t)));
    return { entries: es, tags: Array.from(tagSet).sort() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  const ql = query.trim().toLowerCase();
  const matchedEntries: Hit[] = (ql
    ? entries.filter(
        (e) => matchesQuery(e, ql)
      )
    : entries.slice(0, 6)
  ).map((e) => ({ key: e.key, title: e.title, ns: crumb(e.key) }));
  const matchedTags = ql ? tags.filter((t) => t.toLowerCase().includes(ql)) : [];
  const total = matchedEntries.length + matchedTags.length;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    // Escape is owned by the overlay hook (document capture); only the list
    // navigation lives here.
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, Math.max(0, total - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      (dialogRef.current?.querySelector('.grove-search__row[data-sel="1"]') as HTMLElement | null)?.click();
    }
  };

  const follow = useFollowLink();
  const activeId = total > 0 ? `${listId}-opt-${sel}` : undefined;

  return (
    <div className="grove-search" onClick={onClose}>
      <div
        className="grove-search__box"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Search entries and tags"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grove-search__in">
          <Icon name="search" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search entries and tags"
            value={query}
            placeholder="Search entries and tags…"
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKey}
          />
          <kbd>esc</kbd>
        </div>
        <div className="grove-search__res" role="listbox" id={listId} aria-label="Results">
          {total === 0 ? (
            <div className="grove-search__empty">
              No entry matches <code>{query}</code>.
            </div>
          ) : (
            <>
              {matchedEntries.length ? <div className="grove-search__grp">{ql ? 'Entries' : 'Recent'}</div> : null}
              {matchedEntries.map((h, i) => (
                <Link
                  key={h.key}
                  href={keyToHref(h.key)}
                  className="grove-search__row"
                  data-sel={sel === i ? '1' : '0'}
                  id={`${listId}-opt-${i}`}
                  role="option"
                  aria-selected={sel === i}
                  onClick={(e) => {
                    // R3-872: the policy first (it preventDefaults plain clicks and
                    // no-ops modified ones), then the overlay's own close — the
                    // same order the bare onClick={onClose} had with no policy.
                    followLinkOnClick(follow, { key: h.key, href: keyToHref(h.key) })(e);
                    onClose();
                  }}
                >
                  <Icon name="file" />
                  <span className="t">
                    <InlineProse text={h.title} trimPeriod />
                  </span>
                  <span className="c">/{h.ns}</span>
                </Link>
              ))}
              {matchedTags.length ? <div className="grove-search__grp">Tags</div> : null}
              {matchedTags.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  className="grove-search__row"
                  data-sel={sel === matchedEntries.length + i ? '1' : '0'}
                  id={`${listId}-opt-${matchedEntries.length + i}`}
                  role="option"
                  aria-selected={sel === matchedEntries.length + i}
                  onClick={() => {
                    setQuery(t);
                    setSel(0);
                  }}
                >
                  <Icon name="list" />
                  <span className="t">#{t}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
