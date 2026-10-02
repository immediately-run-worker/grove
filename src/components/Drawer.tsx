import { Link } from '@immediately-run/sdk';
import { useOverlayFocusDismiss } from '../hooks/useOverlayFocusDismiss';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import Sidebar from './Sidebar';
import Icon from './Icon';

interface NavItem {
  /** The corpus key (R3-872 — the navigation policy's target names it). */
  key: string;
  href: string;
  label: string;
  cur: boolean;
}

// `.grove-drawer` — the mobile nav drawer: site mark + nav items + the full
// namespace tree, over a dismiss scrim. The panel carries the dialog contract
// (R3-608): focus in, Tab trapped, Escape, focus return — via the shared
// overlay hook, whose stack makes nested overlays close one per Escape.
export default function Drawer({
  siteTitle,
  nav,
  onClose,
}: {
  siteTitle: string;
  nav: NavItem[];
  onClose: () => void;
}) {
  const dialogRef = useOverlayFocusDismiss(true, onClose);
  const follow = useFollowLink();
  return (
    <div className="grove-drawer" onClick={onClose}>
      <div
        className="grove-drawer__panel"
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grove-drawer__h">
          <span className="mk" />
          <span className="t">{siteTitle}</span>
          <button className="x" aria-label="Close menu" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {nav.length ? (
          <nav className="grove-drawer__nav">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                data-cur={n.cur ? '1' : '0'}
                onClick={(e) => {
                  followLinkOnClick(follow, { key: n.key, href: n.href })(e);
                  onClose();
                }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <Sidebar />
      </div>
    </div>
  );
}
