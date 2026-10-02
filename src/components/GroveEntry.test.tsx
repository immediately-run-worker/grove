// @vitest-environment jsdom
// R3-872 (APP_CUSTOMIZATION_SPEC §4.1) — GroveEntry: one entry from a key.
//   • frame 'none' renders the bare entry — header + body + metadata — with NO
//     layout-chain wrapper;
//   • frame 'chain' renders through the layout chain (the stock page's shape);
//   • both publish the entry context (a WikiLink inside resolves relative to the
//     entry, not the URL) and both carry the data-entry marker on the body
//     region (§4.5's scoping contract, both render paths);
//   • the stock page renders through GroveEntry with today's DOM landmarks.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { CorpusScanContext } from '../lib/corpusScanContext';
import type { CorpusScanGate } from '../lib/corpusScan';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
  });
});

// The fs double: entry bodies read through it. `render: safe` in the metadata keeps the
// body on the interpreter path (the compiled evaluator only exists in the sandbox
// bundler) — the marker assertions below pin the WRAPPER, which both paths mount.
const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock('fs', () => ({ default: { promises: { readFile: (...a: unknown[]) => readFile(...a) } } }));
(globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = {
  promises: { readFile: (...a: unknown[]) => readFile(...a) },
};

const { default: GroveEntry } = await import('./GroveEntry');
const { default: GroveWiki } = await import('../GroveWiki');

const ENTRY = '/app/content/wiki/a.mdx';
const HOME = '/app/content/home.mdx';
const LAYOUT = '/app/content/_layout.mdx';

const NAV = {
  mode: 'github',
  namespace: 'immediately-run',
  provider: 'github',
  repository: 'corpus',
  ref: 'main',
  sandboxPath: ENTRY,
  hash: '',
  search: '',
};

const META = {
  [ENTRY]: { title: 'Reference entry.', render: 'safe', date: '2026-06-22', tags: ['handbook'] },
  [HOME]: { title: 'Home', render: 'safe' },
  [LAYOUT]: { site: 'Fixture' },
};

beforeEach(() => {
  readFile.mockReset();
  readFile.mockImplementation(async (path: string) =>
    // A layout carries <Outlet /> where the page goes (a layout body without one
    // swallows the page — pre-existing harness behavior, not under test here).
    path === LAYOUT
      ? '---\nlayoutRole: root\n---\n\nCHAIN-MARKER\n\n<Outlet />\n'
      : '---\ntitle: Reference entry.\nrender: safe\n---\n\nThe body text.\n',
  );
});

const gateAll: CorpusScanGate = {
  isSettled: () => true,
  prioritize: () => undefined,
  readFailure: () => null,
};

function mount(): { container: HTMLElement; root: Root } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderInto(root: Root, node: React.ReactNode) {
  await act(async () => {
    root.render(
      <TinkerableContext.Provider
        value={{ outerHref: 'https://immediately.run/x', navigationState: NAV, routingSpec: { routes: [] } as never, filesMetadata: META } as never}
      >
        <CorpusScanContext value={gateAll}>{node}</CorpusScanContext>
      </TinkerableContext.Provider>,
    );
  });
  for (let i = 0; i < 6; i++) await act(async () => {});
}

describe('GroveEntry (R3-872)', () => {
  it("frame 'none' renders the bare entry — no layout chain, the landmarks intact", async () => {
    const { container, root } = mount();
    await renderInto(root, <GroveEntry entryKey={ENTRY} frame="none" />);
    // the entry renders
    const article = container.querySelector('article.grove-page');
    expect(article).toBeTruthy();
    expect(container.querySelector('.grove-entry-header h1')?.textContent).toContain('Reference entry');
    expect(container.querySelector('.grove-tag')?.textContent).toBe('#handbook');
    // no layout chain: no shell wrapper, no default-layout landmarks
    expect(container.querySelector('.grove-shell')).toBeNull();
    expect(container.textContent).not.toContain('CHAIN-MARKER');
    // the body region carries the marker (the safe path — SafeEntryBody — and the
    // compiled path's wrapper both carry it; here the safe path renders)
    expect(container.querySelector('[data-entry]')).toBeTruthy();
    expect(container.querySelector('[data-entry]')?.getAttribute('data-entry')).toBe(ENTRY);
    await act(async () => root.unmount());
  });

  it("frame 'chain' renders the layout chain around the entry (the stock page's shape)", async () => {
    // The chain's chrome reads the shell — the same shape GroveNav.test.tsx
    // builds (a composer rendering 'chain' provides the shell; the stock page
    // is exactly that).
    const { GroveShellContext } = await import('../lib/shell');
    const shell = {
      siteTitle: 'Fixture',
      navItems: [],
      entryKey: ENTRY,
      vw: 'desktop',
      navMode: 'top',
      writable: false,
      openEditor: () => {},
      editBusy: false,
      editRefused: false,
      editHint: '',
      // PageView's page-level states read these (the shell owns them).
      directory: { status: 'none' },
      missing: false,
      suggestion: undefined,
      mins: 0,
      safe: true,
      includePath: '/app/content/wiki/a.mdx',
      layout: 'doc',
      showRails: false,
    };
    const { container, root } = mount();
    await act(async () => {
      root.render(
        <TinkerableContext.Provider
          value={{ outerHref: 'https://immediately.run/x', navigationState: NAV, routingSpec: { routes: [] } as never, filesMetadata: META } as never}
        >
          <CorpusScanContext value={gateAll}>
            <GroveShellContext.Provider value={shell as never}>
              <GroveEntry entryKey={ENTRY} frame="chain" />
            </GroveShellContext.Provider>
          </CorpusScanContext>
        </TinkerableContext.Provider>,
      );
    });
    for (let i = 0; i < 6; i++) await act(async () => {});
    // the chain's own evidence (the mocked layout carries the marker text
    // around its <Outlet/>) + the entry inside it
    expect(container.textContent).toContain('CHAIN-MARKER');
    const article = container.querySelector('article.grove-page');
    expect(article).toBeTruthy();
    expect(container.querySelector('.grove-entry-header h1')?.textContent).toContain('Reference entry');
    expect(container.querySelector('[data-entry]')?.getAttribute('data-entry')).toBe(ENTRY);
    await act(async () => root.unmount());
  });

  it('the compiled path carries the marker too (§4.5: both render paths, so fragment scoping never falls document-wide on a multi-entry page)', async () => {
    // render: safe removed from the entry's metadata → the compiled branch. The
    // marker sits on EntryBody's wrapper div, mounted before <Include> resolves —
    // the marker means "this region belongs to entry X"; a fragment not yet in it
    // reads as not-found and the caller keeps waiting (the commit-timing rule).
    const metaCompiled = { ...META, [ENTRY]: { title: 'Reference entry.', date: '2026-06-22', tags: ['handbook'] } };
    const { container, root } = mount();
    await act(async () => {
      root.render(
        <TinkerableContext.Provider
          value={{ outerHref: 'https://immediately.run/x', navigationState: NAV, routingSpec: { routes: [] } as never, filesMetadata: metaCompiled } as never}
        >
          <CorpusScanContext value={gateAll}>
            <GroveEntry entryKey={ENTRY} frame="none" />
          </CorpusScanContext>
        </TinkerableContext.Provider>,
      );
    });
    for (let i = 0; i < 6; i++) await act(async () => {});
    const marked = container.querySelector('[data-entry]');
    expect(marked?.getAttribute('data-entry')).toBe(ENTRY);
    await act(async () => root.unmount());
  });

  it('the stock page renders through GroveEntry with the same DOM landmarks (content/home.mdx)', async () => {
    const { container, root } = mount();
    await renderInto(root, <GroveWiki />);
    // the landmarks every reader path depends on: shell, the article, header,
    // prose, the marker naming the rendered entry
    expect(container.querySelector('.grove-shell')).toBeTruthy();
    expect(container.querySelector('article.grove-page')).toBeTruthy();
    expect(container.querySelector('.grove-entry-header')).toBeTruthy();
    expect(container.querySelector('.grove-prose')).toBeTruthy();
    const marked = container.querySelector('[data-entry]');
    expect(marked?.getAttribute('data-entry')).toBe(ENTRY);
    await act(async () => root.unmount());
  });
});
