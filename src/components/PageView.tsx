import { Link } from '@immediately-run/sdk';
import { useShell, EDIT_REFUSED_NOTICE } from '../lib/shell';
import { keyToHref, keyToRepoRel, homeKey } from '../lib/content';
import { crumb } from '../lib/wiki';
import { useHeadingFragmentUrl } from '../hooks/useHeadingFragmentUrl';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import DirectoryView from './DirectoryView';
import EntryBody from './EntryBody';
import Icon from './Icon';

// `<PageView/>` — the reading view for the current entry: the 404/missing state,
// or the entry header + prose body (+ ToC / backlinks rails). This is what the
// INNERMOST `<Outlet/>` renders at the bottom of the layout chain. It carries no
// site chrome (nav / sidebar / footer) — that's the layout's job — so the page
// stays free of shell concerns.
export default function PageView() {
  // R3-872: the entry content lives in EntryBody (one renderer, shared with
  // GroveEntry); the page keeps only the page-level states (checking /
  // directory / missing) and the deep-link half it owns.
  const { entryKey, missing, suggestion, writable, openEditor, editBusy, editRefused, editHint, directory } =
    useShell();
  const follow = useFollowLink();

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
          {suggestion ? <> Did you mean <Link className="grove-wikilink" data-state="ok" href={keyToHref(suggestion)} onClick={followLinkOnClick(follow, { key: suggestion, href: keyToHref(suggestion), from: entryKey })}>{crumb(suggestion)}</Link>?</> : null}
        </p>
        <div className="grove-state__actions">
          <Link className="btn-ghost" href="/" onClick={followLinkOnClick(follow, { key: homeKey(), href: '/', from: entryKey })}><Icon name="chevron-right" /> Back to home</Link>
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

  return <EntryBody entryKey={entryKey} />;
}
