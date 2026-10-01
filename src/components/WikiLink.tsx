/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from 'react';
import { Link, useMetadataQuery } from '@immediately-run/sdk';
import { hrefKeyCandidates, hrefTargetKey, isContentEntry, keyToHref, linkKind, splitFragment } from '../lib/content';
import { isFolderKey } from '../lib/directory';
import { queryPaths } from '../lib/wiki';
import { useEntryKey } from '../hooks/useEntryKey';
import Icon from './Icon';

interface Props {
  href?: string;
  children?: React.ReactNode;
  className?: string;
}

// The MDX `a` override. A link into the content space renders as a wiki-link with one of
// three states (brief 00) — resolved / broken / self; an external scheme or a bare
// `#anchor` renders as an ordinary markdown link, so the two are distinguishable at a
// glance. Those are the ONLY two shapes: an in-app href that resolves to nothing renders
// broken, never as a bare `<a>` (see `linkKind` — R3-252).
export default function WikiLink({ href = '', children, ...rest }: Props) {
  // R3-871: the entry this link renders inside, not whatever the URL says.
  const currentKey = useEntryKey();

  // Resolve existence against the whole in-memory index (so a missing target is
  // *definitively* broken, not a load-time flash).
  const allKeysQuery = useCallback(
    (fm: Record<string, any>) => Object.keys(fm).filter(isContentEntry),
    []
  );
  const q = useMetadataQuery(allKeysQuery);
  const keys: string[] = queryPaths(q);
  const loaded = keys.length > 0;

  // Normalize an in-app content href to its canonical metadata key; null for
  // external/anchor links. Handles the ABSOLUTE forms (`/content/x.mdx`,
  // `/files/content/x.mdx`) and the RELATIVE form an author actually writes
  // (`roadmap/index.mdx`, `../specs/FOO.mdx`), which is resolved against the current
  // entry the same way `check-docs-wiki` resolves `[[…]]` links. A relative href used
  // to land here as `null` and render as a bare `<a>`, so clicking it made the sandbox
  // perform a real navigation instead of routing — the "Failed to construct 'URL'"
  // crash. Candidates are tried in order so a pre-cutover `foo.md` still finds `foo.mdx`
  // even though the corpus itself no longer carries those names.
  const candidates = hrefKeyCandidates(href, currentKey);
  const targetKey = candidates.find((k) => keys.includes(k)) ?? candidates[0] ?? null;
  // Route on the RESOLVED key, not the author's text: handing `<Link>` a relative href
  // would make it resolve against the outer page URL rather than the content tree.
  const [, fragment] = splitFragment(href);
  const resolvedHref = targetKey ? keyToHref(targetKey) + fragment : href;

  // Only an href that MEANS to leave the document becomes a real `<a>` — see `linkKind`.
  // An unresolvable in-app href renders broken rather than falling through to an anchor
  // that would navigate the sandboxed frame away and kill the app (R3-252).
  if (!targetKey) {
    const kind = linkKind(href);
    // A FOLDER is a destination too, since directory listings landed: `[the
    // handbook](handbook)` names something real, and the extension test that decides
    // what an *entry* is would otherwise call it broken. Judged from the index (no fs
    // call per link) — see `isFolderKey` for what that trades away.
    const dirKey = kind === 'content' ? hrefTargetKey(href, currentKey) : null;
    if (dirKey && loaded && isFolderKey(dirKey, keys)) {
      return (
        <Link href={keyToHref(dirKey) + fragment} className="grove-wikilink" data-state="ok" {...rest}>
          {children}
        </Link>
      );
    }
    if (kind !== 'content') {
      const web = /^https?:/i.test(href);
      return (
        <a
          className="mdlink"
          href={href}
          {...(web ? { target: '_blank', rel: 'noreferrer' } : {})}
          {...rest}
        >
          {children}
        </a>
      );
    }
    return (
      <span className="grove-wikilink" data-state="broken" title={`No entry at ${href}`} aria-label={`No entry at ${href}`}>
        <Icon name="unlink" />
        {children}
      </span>
    );
  }

  if (targetKey === currentKey) {
    return (
      <span className="grove-wikilink" data-state="self">
        {children}
      </span>
    );
  }

  const exists = !loaded || keys.includes(targetKey); // optimistic until loaded
  if (!exists) {
    return (
      <span className="grove-wikilink" data-state="broken" title={`No entry at ${href}`} aria-label={`No entry at ${href}`}>
        <Icon name="unlink" />
        {children}
      </span>
    );
  }

  return (
    <Link href={resolvedHref} className="grove-wikilink" data-state="ok" {...rest}>
      {children}
    </Link>
  );
}
