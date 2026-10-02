/* eslint-disable @typescript-eslint/no-explicit-any */
import { useFileMetadata } from '@immediately-run/sdk';
import { EDIT_REFUSED_NOTICE } from '../lib/shell';
import { crumb } from '../lib/wiki';
import Icon from './Icon';
import InlineProse from './InlineProse';

// The entry's header block: breadcrumb, title (optional gradient), meta row
// (date · reading time · tags) and the unobtrusive edit affordance. Rendered by
// <PageView> at the top of every entry.
export interface EntryHeaderAffordance {
  busy: boolean;
  refused: boolean;
  openEditor: (entryKey: string) => void;
  hint: string;
}

export default function EntryHeader({
  entryKey,
  writable,
  mins,
  affordance,
}: {
  entryKey: string;
  writable: boolean;
  mins: number;
  /** The edit affordance's live state — R3-872: passed in (the shell's on the
   *  stock page, self-derived standalone), never read off a context here, so the
   *  header renders inside any entry composition. */
  affordance: EntryHeaderAffordance;
}) {
  const { openEditor, busy: editBusy, refused: editRefused, hint: editHint } = affordance;
  const meta = useFileMetadata(entryKey) as any;
  if (!meta) return null;
  const tags: string[] = Array.isArray(meta.tags) ? meta.tags.filter((t: string) => !t.startsWith('ui/')) : [];
  const cr = crumb(entryKey);
  return (
    <header className="grove-entry-header">
      {cr.includes('/') ? <nav className="crumb">{cr}</nav> : null}
      <h1 className={meta.grad ? 'grad' : ''}>
        {/* R3-531 — the title is frontmatter prose: code spans render as code. */}
        <InlineProse text={meta.title || cr} />
      </h1>
      <div className="grove-meta">
        {meta.date && <span>{meta.date}</span>}
        {mins ? <span>→ {mins} min read</span> : null}
        {tags.length ? <span className="dot">·</span> : null}
        {tags.map((t) => (
          <span key={t} className="grove-tag">#{t}</span>
        ))}
        {writable && (
          <>
            <button
              className="grove-edit-affordance"
              data-busy={editBusy ? '1' : '0'}
              title={editHint}
              onClick={() => openEditor(entryKey)}
            >
              <Icon name="pencil" />
              {editBusy ? 'Opening editor…' : 'Edit'}
            </button>
            {editRefused && (
              <span className="grove-edit-refused" role="status">
                {EDIT_REFUSED_NOTICE}
              </span>
            )}
          </>
        )}
      </div>
    </header>
  );
}
