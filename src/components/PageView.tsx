/* eslint-disable @typescript-eslint/no-explicit-any */
import { Include, Link } from '@immediately-run/sdk';
import { useShell, EDIT_REFUSED_NOTICE } from '../lib/shell';
import { keyToHref, keyToRepoRel } from '../lib/content';
import { crumb } from '../lib/wiki';
import { useHeadingFragmentUrl } from '../hooks/useHeadingFragmentUrl';
import DirectoryView from './DirectoryView';
import EntryHeader from './EntryHeader';
import SafeEntryBody from './SafeEntryBody';
import ScrollToFragment from './ScrollToFragment';
import Toc from './Toc';
import Backlinks from './Backlinks';
import Icon from './Icon';

declare const module: any;

// `<PageView/>` — the reading view for the current entry: the 404/missing state,
// or the entry header + prose body (+ ToC / backlinks rails). This is what the
// INNERMOST `<Outlet/>` renders at the bottom of the layout chain. It carries no
// site chrome (nav / sidebar / footer) — that's the layout's job — so the page
// stays free of shell concerns.
export default function PageView() {
  const { entryKey, includePath, layout, showRails, mins, missing, suggestion, writable, openEditor, editBusy, editRefused, editHint, vw, safe, directory } =
    useShell();

  // The reading view owns the headings, so it owns the outgoing half of deep
  // linking: same-page heading navigation writes the fragment into the host's
  // address bar (`useHeadingFragmentUrl` for the whole story).
  useHeadingFragmentUrl();

  // A folder URL. `checking` renders nothing rather than the 404: the readdir that
  // decides between them is one RPC away, and a 404 that appears and then turns into a
  // listing reads as a broken link that healed itself.
  if (directory.status === 'checking') return <div className="grove-state" data-state="checking" />;
  if (directory.status === 'ready') return <DirectoryView />;

  if (missing) {
    return (
      <div className="grove-state">
        <div className="grove-state__art" />
        <h2>No entry at <code>{keyToRepoRel(entryKey).replace(/^content/, '')}</code>.</h2>
        <p>
          That link points to an entry that doesn’t exist yet.
          {suggestion ? <> Did you mean <Link className="grove-wikilink" data-state="ok" href={keyToHref(suggestion)}>{crumb(suggestion)}</Link>?</> : null}
        </p>
        <div className="grove-state__actions">
          <Link className="btn-ghost" href="/"><Icon name="chevron-right" /> Back to home</Link>
          {writable ? (
            <>
            <button
              className="btn-primary"
              data-busy={editBusy ? '1' : '0'}
              title={editHint}
              disabled={editBusy}
              onClick={() => openEditor(entryKey)}
            >
              <Icon name="file-plus" />{editBusy ? 'Opening editor…' : 'Create it'}
            </button>
              {editRefused && (
                <span className="grove-edit-refused" role="status">{EDIT_REFUSED_NOTICE}</span>
              )}
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <article className="grove-page" data-layout={layout}>
      <div className="gp-main">
        <EntryHeader entryKey={entryKey} writable={writable} mins={mins} />
        {showRails && vw === 'mobile' ? (
          <details className="grove-toc__disclosure">
            <summary>On this page</summary>
            <Toc entryKey={entryKey} />
          </details>
        ) : null}
        <div className="grove-prose">
          {/* Interpreter mode (R3-213) renders the raw entry as data — no author JS runs;
              executable mode compiles + runs the MDX via <Include>. Both are supported,
              and since R3-252 the choice is per-entry as well as wiki-wide.

              The compiled branch mounts <ScrollToFragment> too — deep-link landing is not
              a safe-path feature — but deliberately carries NO `data-entry` marker, and
              both halves of that are load-bearing (R3-252).

              `key={entryKey}` forces an unmount across a client-side navigation. Without
              it React reuses this subtree and keeps the PREVIOUS document mounted while
              the new one compiles, so `#sec-4` resolves against the wrong entry — every
              entry here numbers its sections from 1, so that lookup always succeeds and
              always lands wrong. Measured on the host: a citation to core_concepts §4
              ("4 — Principal") scrolled to a different document's "4. The provider-facing
              contract" (R3-249's hazard, reintroduced).

              No marker, because `<Include>` owns an internal <Suspense> and this wrapper
              is OUTSIDE it — so a marker here would appear the instant we navigate, while
              the body is still compiling, and claim a commit that has not happened. That
              is worse than no signal: `data-entry` means "this subtree holds entry X's
              committed body" everywhere else (`SafeEntryBody` puts it inside the suspended
              subtree, so it is true there), and the on-host harness waits on it. Keying
              already removes the hazard the marker defended against — the outgoing
              document is gone from the DOM, not lingering — so `resolveFragmentTarget`'s
              documented document-wide fallback for the compiled path is safe here. */}
          {safe ? (
            <SafeEntryBody entryKey={entryKey} />
          ) : (
            <div className="grove-entry-body" key={entryKey}>
              <Include filename={includePath} baseModule={module} />
              <ScrollToFragment entryKey={entryKey} />
            </div>
          )}
        </div>
        {showRails ? <Backlinks /> : null}
      </div>
      {showRails && vw === 'desktop' ? <Toc entryKey={entryKey} /> : null}
    </article>
  );
}
