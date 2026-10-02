import { Link } from '@immediately-run/sdk';
import { useShell, EDIT_REFUSED_NOTICE } from '../lib/shell';
import { getContentRoot } from '../lib/contentRoot';
import { homeKey } from '../lib/content';
import { useFollowLink } from '../hooks/useFollowLink';
import { followLinkOnClick } from '../lib/navigationPolicy';
import { useOverlayFocusDismiss } from '../hooks/useOverlayFocusDismiss';
import { THEMES } from '../data/themes';
import Icon from './Icon';

// `<GroveNav/>` — the top navigation bar. Import-free in MDX, so a layout places
// it with `<GroveNav/>`. Its interactive state (drawer / search / theme menu)
// lives in the shell context; this component only arranges and drives it.
export default function GroveNav() {
  const {
    siteTitle,
    navItems,
    entryKey,
    writable,
    openEditor,
    editBusy,
    editRefused,
    editHint,
    theme,
    setTheme,
    light,
    setLight,
    menuOpen,
    setMenuOpen,
    setSearchOpen,
    setDrawerOpen,
  } = useShell();
  const follow = useFollowLink();

  const askGrove = () => {
    const el = (document.querySelector('.ga-foot input') || document.querySelector('.ga-line input')) as HTMLElement | null;
    el?.focus();
  };
  // The new entry belongs to whichever corpus is mounted, so it is named from the
  // content ROOT rather than the fork's `content/` literal — under dispatch the latter
  // would create a file in Grove's own repo (R3-266).
  const newEntry = () => openEditor(`${getContentRoot()}untitled.mdx`);

  // The theme menu's contract (R3-608): the shared overlay hook with Tab-trap
  // OFF (menus do not trap Tab), plus the menu keydown map — arrows walk the
  // menuitems, Escape closes (the hook), focus returns to the theme button.
  const menuRef = useOverlayFocusDismiss(menuOpen, () => setMenuOpen(false), { trapTab: false });
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      const next = items[(i + items.length) % items.length];
      next.focus();
      // APG menu radios: arrows MOVE focus AND activate — the radio the arrow
      // lands on is selected, so the keyboard alone can change the theme.
      if (next.getAttribute('role') === 'menuitemradio' && next.getAttribute('aria-checked') !== 'true') next.click();
    };
    if (e.key === 'ArrowDown') move(idx + 1);
    else if (e.key === 'ArrowUp') move(idx - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
  };

  return (
    <nav className="grove-nav">
      <button className="grove-hamburger icbtn" aria-label="Menu" onClick={() => setDrawerOpen(true)}>
        <Icon name="list" />
      </button>
      <Link href="/" className="grove-brand" onClick={followLinkOnClick(follow, { key: homeKey(), href: '/', from: entryKey })}>
        <span className="tile" style={{ background: 'var(--grad)' }} />
        {siteTitle}
      </Link>
      <div className="grove-nav__links">
        {navItems.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            data-cur={n.key === entryKey ? '1' : '0'}
            onClick={followLinkOnClick(follow, { key: n.key, href: n.href, from: entryKey })}
          >
            {n.label}
          </Link>
        ))}
      </div>
      <div className="grove-nav__cluster">
        <button className="icbtn" aria-label="Search" onClick={() => setSearchOpen(true)}>
          <Icon name="search" />
        </button>
        {writable && (
          <>
            <button
              className="icbtn"
              aria-label={editBusy ? 'Opening editor…' : 'New entry'}
              title={editHint}
              data-busy={editBusy ? '1' : '0'}
              disabled={editBusy}
              onClick={newEntry}
            >
              <Icon name="plus" />
            </button>
            {editRefused && (
              <span className="grove-edit-refused" role="status" title={EDIT_REFUSED_NOTICE}>
                {EDIT_REFUSED_NOTICE}
              </span>
            )}
          </>
        )}
        <button className="icbtn" aria-label="Ask Grove" onClick={askGrove}>
          <Icon name="message" />
        </button>
        <div className="grove-nav__more">
          <button className="icbtn grove-theme-control" title="Theme" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((o) => !o)}>
            ☀
          </button>
          {menuOpen ? (
            <>
              <div className="gtm__scrim" onClick={() => setMenuOpen(false)} />
              <div className="grove-theme-menu" role="menu" aria-label="Theme" ref={menuRef} tabIndex={-1} onKeyDown={onMenuKeyDown}>
                <div className="gtm__h">Theme</div>
                <div className="gtm__list">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      className="gtm__row"
                      data-cur={theme === t.id ? '1' : '0'}
                      role="menuitemradio"
                      aria-checked={theme === t.id}
                      tabIndex={-1}
                      onClick={() => setTheme(t.id)}
                    >
                      <span className="gtm__sw" style={{ background: t.swatch }} />
                      <span className="gtm__name">{t.label}</span>
                      {theme === t.id ? <span className="gtm__ck"><Icon name="check" /></span> : null}
                    </button>
                  ))}
                </div>
                {/* R3-308: the appearance control is offered for EVERY theme — each
                    catalogue entry ships both polarities, so gating it on
                    `default` would be single-polarity by construction again. */}
                <div className="gtm__appearance">
                  <div className="gtm__sub">Appearance</div>
                  <div className="gtm__seg">
                    <button data-on={!light ? '1' : '0'} role="menuitemradio" aria-checked={!light} tabIndex={-1} onClick={() => setLight(false)}>
                      <Icon name="moon" /> Dark
                    </button>
                    <button data-on={light ? '1' : '0'} role="menuitemradio" aria-checked={light} tabIndex={-1} onClick={() => setLight(true)}>
                      <Icon name="sun" /> Light
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
