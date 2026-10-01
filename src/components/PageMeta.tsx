/* eslint-disable @typescript-eslint/no-explicit-any */
import { useFileMetadata } from '@immediately-run/sdk';

import { useEntryKey } from '../hooks/useEntryKey';

// `<PageMeta/>` — the current entry's date + tags as a styled strip, for authors
// who want the meta inside the body (the entry header already renders one).
export default function PageMeta() {
  const key = useEntryKey();
  const meta = useFileMetadata(key) as any;
  if (!meta) return null;
  const tags: string[] = Array.isArray(meta.tags) ? meta.tags.filter((t: string) => !t.startsWith('ui/')) : [];
  return (
    <div className="grove-meta">
      {meta.date && <span>{meta.date}</span>}
      {tags.length ? <span className="dot">·</span> : null}
      {tags.map((t) => (
        <span key={t} className="grove-tag">#{t}</span>
      ))}
    </div>
  );
}
