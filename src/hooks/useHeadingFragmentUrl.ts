import { useCallback, useEffect } from 'react';
import { useContext } from 'react';
import { navigate } from '@immediately-run/sdk';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { constructOuterUrl } from '@immediately-run/sdk/urlUtils';
import { fragmentOf } from '../lib/fragment';

/**
 * Reflect same-page heading navigation in the ADDRESS BAR.
 *
 * The deep-linking pair has exactly one half so far: the host forwards the outer URL's
 * `#fragment` in (R3-249, Capability C §13.5) and `<ScrollToFragment>` lands it — but
 * nothing ever WRITES a fragment, so a reader who follows the contents rail, clicks a
 * heading permalink or lands on a section has a URL bar that still names no section.
 * Copying the address gives someone else the top of the page.
 *
 * This hook is the outgoing half. A delegated `click` listener on the document covers
 * every way a heading is reached without each surface wiring its own handler:
 *
 *  - the contents rail's `<a href="#id">` (grove's `<TableOfContents>` smooth-scrolls
 *    itself; the URL simply never heard about it);
 *  - the SDK's `<HeadingAnchor>` permalinks — absolute host URLs whose own pathname
 *    (a `/files/…` subpath) must NOT be navigated to, so only the FRAGMENT is taken and
 *    the target is rebuilt on the reader's current path;
 *  - a click on a heading element with an id (any depth).
 *
 * `navigate()` is the sanctioned app→host URL channel: an in-prefix `urlchange` whose
 * target carries a hash is pushed onto the browser's address bar without a reload, and
 * the echoed navigation sets `navigationState.hash`, which is what `<ScrollToFragment>`
 * re-runs on — the platform's own loop completes the landing. Modifier clicks are the
 * browser's (open-in-new-tab and copy-link are what the permalink's absolute href is
 * FOR); a fragment naming nothing on the page is ignored rather than pushed; and a
 * fragment equal to the one already in the URL does not stack another history entry.
 *
 * Off-host (`vite dev`, an empty `outerHref`) there is no host to tell, so the fragment
 * is written to the frame's own URL with `history.replaceState` — a reload then lands
 * where the reader was, and no history is spent.
 */
export function useHeadingFragmentUrl(): void {
  // Deep import per <ScrollToFragment>'s precedent: the context is not on the SDK's
  // index surface, and this app reads it for `outerHref`/`navigationState` only.
  const ctx = useContext(TinkerableContext) as {
    outerHref?: string;
    navigationState?: { hash?: string };
  };

  const sync = useCallback(
    (fragment: string) => {
      const navigationState = ctx?.navigationState;
      if (!ctx?.outerHref || !navigationState) {
        try {
          history.replaceState(null, '', `#${fragment}`);
        } catch {
          // a history the browser refuses is dev noise, not an error
        }
        return;
      }
      navigate(constructOuterUrl(ctx.outerHref, `#${fragment}`, navigationState as never));
    },
    [ctx],
  );

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const fragment = clickedFragment(event.target as HTMLElement | null, ctx?.outerHref ?? '');
      if (!fragment) return;
      // Already shown (locator-glued dev hashes included — `fragmentOf` takes the
      // leading component): a second push would only stack a history entry.
      if (fragmentOf(ctx?.navigationState?.hash) === fragment) return;
      if (!document.getElementById(fragment) && !document.querySelector(`[data-slug="${fragment}"]`)) return;
      sync(fragment);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [sync, ctx]);
}

/** The fragment this click addresses, or null when it is not heading navigation. */
function clickedFragment(element: HTMLElement | null, outerHref: string): string | null {
  const anchor = element?.closest('a');
  if (anchor) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith('#')) return fragmentOf(href);
    try {
      const url = new URL(href, window.location.href);
      // Absolute hrefs: only the app's OWN permalink URLs count. Their origin is the
      // outer origin — the sandbox frame's `location.origin` is different, so compare
      // against the outer href, never against the frame.
      const ownOrigin = outerHref ? new URL(outerHref).origin : window.location.origin;
      if (!url.hash || url.origin !== ownOrigin) return null;
      return fragmentOf(url.hash);
    } catch {
      return null;
    }
  }
  return element?.closest('h1[id], h2[id], h3[id], h4[id]')?.id ?? null;
}
