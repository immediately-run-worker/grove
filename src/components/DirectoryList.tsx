/* eslint-disable @typescript-eslint/no-explicit-any */
import { Link, useAllMetadata } from '@immediately-run/sdk';

import { useEntryKey } from '../hooks/useEntryKey';
import {
  buildDirectoryRows,
  columnValue,
  parseColumns,
  resolveDirKey,
  rowLabel,
  visibleColumns,
  type DirColumn,
  type DirRow,
} from '../lib/directory';
import { useDirectoryListing } from '../hooks/useDirectoryListing';
import Icon from './Icon';

interface Props {
  /** The folder to list. Corpus-relative with a leading `/` (`/handbook`), otherwise
   *  relative to the current entry's folder. Omit it to list the current folder. */
  path?: string;
  /** Heading above the table. `null`/`""` renders no heading. */
  title?: string | null;
  /** `description,tags,updated,status` — which metadata columns to consider. A column
   *  no row carries is dropped regardless, so this narrows, never pads. */
  columns?: string;
  sort?: 'name' | 'title' | 'updated';
  /** Include dot- and `_`-prefixed names. */
  hidden?: boolean | string;
}

const HEADINGS: Record<DirColumn, string> = {
  name: 'Name',
  description: 'Description',
  tags: 'Tags',
  updated: 'Updated',
  status: 'Status',
};

// `hidden="false"` is a string in MDX, and under the safe renderer EVERY attribute is a
// literal string — so a boolean prop that trusted truthiness would read `"false"` as on.
function flag(v: boolean | string | undefined): boolean {
  return v === true || v === '' || v === 'true';
}

function Cell({ row, col }: { row: DirRow; col: DirColumn }) {
  const value = columnValue(row, col);
  if (col === 'tags') {
    const tags = Array.isArray(value) ? value : [];
    return (
      <td className="gdir__tags">
        {/* Same reason as the name cell: the flex box goes INSIDE the `<td>`. */}
        <div className="gdir__tagbox">
          {tags.slice(0, 4).map((t) => (
            <span key={t} className="grove-tag">#{t}</span>
          ))}
        </div>
      </td>
    );
  }
  if (col === 'updated' || col === 'status') {
    return <td className={`mono gdir__${col}`}>{typeof value === 'string' ? value : null}</td>;
  }
  return <td className="gdir__desc">{typeof value === 'string' ? value : null}</td>;
}

function Row({ row, cols }: { row: DirRow; cols: DirColumn[] }) {
  const label = rowLabel(row);
  return (
    <tr data-kind={row.kind}>
      <td className="gdir__name">
        {/* The flex box is INSIDE the cell. `display:flex` on a `<td>` takes it out of
            the table layout algorithm, and the column stops sharing a width with its
            header — the symptom is per-row borders that don't line up. */}
        <div className="gdir__namebox">
          <span className="gdir__icon" aria-hidden="true">
            <Icon name={row.kind === 'dir' ? 'folder' : 'file'} />
          </span>
          <span className="gdir__labels">
            {row.href ? (
              <Link href={row.href} className="gdir__link">
                {label}
              </Link>
            ) : (
              // An asset is listed but not linked: Grove's route space renders entries,
              // so a link here would resolve to the 404 it was meant to replace.
              <span className="gdir__plain">{label}</span>
            )}
            {label !== row.name ? <span className="gdir__file">{row.name}</span> : null}
          </span>
        </div>
      </td>
      {cols.slice(1).map((c) => (
        <Cell key={c} row={row} col={c} />
      ))}
    </tr>
  );
}

/**
 * `<DirectoryList/>` — every file in a folder as a table, enriched with whatever Grove
 * frontmatter its entries carry.
 *
 * Two callers, one component. Content uses it as ordinary import-free vocabulary
 * (`<DirectoryList path="/handbook"/>`); the router renders it for a URL that names a
 * FOLDER rather than an entry — the case that used to 404. Both go through the MDX
 * component map, so a fork or a content-provided `DirectoryList` (R3-174) replaces the
 * built-in on *both* surfaces at once. That is the point of resolving it by name rather
 * than importing it in the router: an override that only reached MDX bodies and left the
 * folder route rendering the stock table would be a half-override nobody could see.
 */
export default function DirectoryList({ path, title, columns, sort = 'name', hidden }: Props) {
  const routeKey = useEntryKey();
  // The route key is a FILE when it names an entry; a listing anchored at an entry means
  // "the folder that entry lives in", which is what an author writing `<DirectoryList/>`
  // inside a page means by "here".
  const fromDir = /\.mdx?$/.test(routeKey) ? routeKey.slice(0, routeKey.lastIndexOf('/')) : routeKey;
  const dirKey = resolveDirKey(path, fromDir);

  const listing = useDirectoryListing(dirKey);
  const metadata = useAllMetadata() as Record<string, any>;

  if (listing.status !== 'ready') {
    return (
      <div className="grove-dirlist" data-state={listing.status}>
        <div className="sk sk-line" style={{ width: '60%' }} />
      </div>
    );
  }

  const rows = buildDirectoryRows(dirKey, listing.entries, metadata, {
    hidden: flag(hidden),
    sort,
  });
  const cols = visibleColumns(rows, parseColumns(columns));

  return (
    <div className="grove-dirlist">
      {title ? (
        <div className="grove-doclist__head">
          <h2>{title}</h2>
          <span className="n">
            {rows.length} {rows.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      ) : null}
      {rows.length === 0 ? (
        // Two different facts, said differently. A folder with nothing in it and a folder
        // whose every child is structural (`_layout.mdx`) both produce zero rows, and
        // "This folder is empty." is false for the second — the reader goes looking for
        // the file they know is there. Say which it is.
        <div className="grove-dirlist__empty">
          <span className="gdir__icon" aria-hidden="true">
            <Icon name="folder" />
          </span>
          <p className="grove-dirlist__empty-t">
            {listing.entries.length === 0 ? 'This folder is empty.' : 'Nothing to show in this folder.'}
          </p>
          <p className="grove-dirlist__empty-d">
            {listing.entries.length === 0
              ? 'No entries, subfolders or files here yet.'
              : `Everything here is hidden or structural — ${listing.entries.length} ${listing.entries.length === 1 ? 'file' : 'files'} skipped.`}
          </p>
        </div>
      ) : (
        <div className="grove-table-wrap">
          <table className="grove-table grove-dirlist__table">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c} scope="col" className={`gdir__th gdir__th--${c}`}>
                    {HEADINGS[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.key} row={r} cols={cols} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
