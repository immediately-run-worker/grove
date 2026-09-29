// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { navigate } from '@immediately-run/sdk';
import { useHeadingFragmentUrl } from './useHeadingFragmentUrl';

vi.mock('@immediately-run/sdk', () => ({ navigate: vi.fn() }));

const NAV = {
  outerHref: 'https://immediately.run/present/github/acme/wiki/main',
  navigationState: {
    mode: 'present',
    provider: 'github',
    namespace: 'acme',
    repository: 'wiki',
    ref: 'main',
    sandboxPath: '/content/guide.mdx',
    hash: '',
    search: '',
  },
  routingSpec: {},
  filesMetadata: {},
};

/** The hook must be INSIDE the provider — in the app the host provides above
 * `<GroveApp>`; here the probe plays that role and an inner component owns the hook. */
function Inner() {
  useHeadingFragmentUrl();
  return (
    <main className="grove-prose">
      <h2 id="sec-2">Two</h2>
      <h3 id="sec-2-1">Two point one</h3>
      <a href="#sec-2" data-testid="toc-entry">Two</a>
      <a href="https://immediately.run/present/github/acme/wiki/main/files/guide.mdx#sec-2-1" data-testid="permalink">
        link
      </a>
      <a href="https://example.com/elsewhere#sec-2" data-testid="external">ext</a>
      <a href="#sec-99" data-testid="dead">dead</a>
    </main>
  );
}

function Probe({ outerHref = NAV.outerHref, hash = '' }: { outerHref?: string; hash?: string }) {
  return (
    <TinkerableContext.Provider value={{ ...NAV, outerHref, navigationState: { ...NAV.navigationState, hash } } as never}>
      <Inner />
    </TinkerableContext.Provider>
  );
}

function clickOn(testId: string, init?: MouseEventInit) {
  const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, ...init }));
}

function mount(props: Parameters<typeof Probe>[0]) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  act(() => root.render(<Probe {...props} />));
  return () => {
    act(() => root.unmount());
    host.remove();
  };
}

// A same-page fragment resolves against the current navigation state — the reader's
// own path, hash replaced (no `/files/` join: the target is not an absolute path).
const SAME_PAGE = 'https://immediately.run/present/github/acme/wiki/main/content/guide.mdx#sec-2';

describe('useHeadingFragmentUrl', () => {
  beforeEach(() => {
    (navigate as unknown as ReturnType<typeof vi.fn>).mockClear();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('navigates to the fragment when a TOC-style #anchor is clicked', () => {
    const un = mount({});
    act(() => clickOn('toc-entry'));
    expect(navigate).toHaveBeenCalledWith(SAME_PAGE);
    un();
  });

  it('navigates to the CURRENT path when a permalink is clicked — only its fragment is taken', () => {
    const un = mount({});
    act(() => clickOn('permalink'));
    // Not the permalink's own URL: the fragment rides the path the reader is on.
    expect(navigate).toHaveBeenCalledWith(
      'https://immediately.run/present/github/acme/wiki/main/content/guide.mdx#sec-2-1',
    );
    un();
  });

  it('navigates when the heading element itself is clicked', () => {
    const un = mount({});
    act(() => {
      document.getElementById('sec-2')!.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    });
    expect(navigate).toHaveBeenCalledWith(SAME_PAGE);
    un();
  });

  it('leaves modifier clicks to the browser (open-in-new-tab, copy-link)', () => {
    const un = mount({});
    act(() => clickOn('toc-entry', { metaKey: true }));
    act(() => clickOn('toc-entry', { ctrlKey: true }));
    act(() => clickOn('toc-entry', { button: 1 }));
    expect(navigate).not.toHaveBeenCalled();
    un();
  });

  it('leaves external links alone, even ones that carry a fragment', () => {
    const un = mount({});
    act(() => clickOn('external'));
    expect(navigate).not.toHaveBeenCalled();
    un();
  });

  it('does not push a history entry for the fragment the URL already shows', () => {
    const un = mount({ hash: 'sec-2' });
    act(() => clickOn('toc-entry'));
    expect(navigate).not.toHaveBeenCalled();
    un();
  });

  it('does not navigate for a fragment that names nothing on the page', () => {
    const un = mount({});
    act(() => clickOn('dead'));
    expect(navigate).not.toHaveBeenCalled();
    un();
  });

  it('off-host, writes the fragment locally instead of messaging a host that is not there', () => {
    const replaceState = vi.spyOn(history, 'replaceState').mockImplementation(() => {});
    const un = mount({ outerHref: '' });
    act(() => clickOn('toc-entry'));
    expect(navigate).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(null, '', '#sec-2');
    replaceState.mockRestore();
    un();
  });
});
