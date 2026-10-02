// @vitest-environment jsdom
// G-CUST-3 (APP_CUSTOMIZATION_SPEC §4.3, R3-872) — the sweep: EVERY component under
// src/components/ that renders the SDK `<Link>` (or calls `navigate(`) is
// enumerated FROM DISK (never a hand-list — a new component that skips the policy
// fails this suite on arrival), rendered with a recording policy over a real
// corpus entry, and plain-clicked: the policy must receive the resolved target
// `{ key, href, fragment?, from? }` and the browser default must be prevented.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReactNode } from 'react';
// The enumeration reads the components directory through a DIRECT require of
// node:fs (createRequire), not the test graph's `fs` — the file mocks `fs` for
// the components under test, and the enumeration must not eat its own mock.
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { readFileSync, readdirSync } = createRequire(import.meta.url)('node:fs') as typeof import('node:fs');
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { GroveShellContext, type GroveShell } from '../lib/shell';
import { NavigationPolicyContext, type FollowLinkTarget } from '../lib/navigationPolicy';
import { keyToHref } from '../lib/content';
import { setContentRoot } from '../lib/contentRoot';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
  });
  setContentRoot('/app/content/');
});

// ── The corpus fixture (a real two-entry shape) ──────────────────────────────
const ENTRY = '/app/content/wiki/a.mdx';
const OTHER = '/app/content/wiki/b.mdx';
const PERSON = '/app/content/people/ada.mdx';
const INDEX = '/app/content/wiki/index.mdx';
const WIKI_C = '/app/content/wiki/c.mdx';
const META: Record<string, Record<string, unknown>> = {
  [ENTRY]: { title: 'Reference entry.', render: 'safe', date: '2026-06-22' },
  [INDEX]: { title: 'The wiki index.', render: 'safe' },
  [WIKI_C]: { title: 'A third entry.', render: 'safe' },
  [OTHER]: { title: 'The other entry.', render: 'safe', date: '2026-06-22' },
  [PERSON]: { name: 'Ada', role: 'eng', team: 'core', phone: '555-1', email: 'a@b.c' },
  '/app/content/home.mdx': { title: 'Home', render: 'safe' },
};

const { readFile, readdirFs } = vi.hoisted(() => ({ readFile: vi.fn(), readdirFs: vi.fn() }));
vi.mock('fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...(actual.default as Record<string, unknown>),
      promises: {
        ...((actual.default as { promises: Record<string, unknown> }).promises),
        readFile: (...a: unknown[]) => readFile(...(a as [])),
        readdir: (...a: unknown[]) => readdirFs(...(a as [])),
      },
    },
  };
});
(globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = {
  promises: { readFile: (...a: unknown[]) => readFile(...(a as [])) },
};

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

/** The shell slice the chrome components read (DirectoryView/PageView read the page
 *  states; GroveNav/Footer read nav; every entry link's `from` reads the route key). */
const shell: GroveShell = {
  siteTitle: 'Fixture',
  navItems: [{ key: OTHER, href: keyToHref(OTHER), label: 'The other entry.' }],
  entryKey: ENTRY,
  vw: 'desktop',
  navMode: 'top',
  writable: false,
  openEditor: () => {},
  editBusy: false,
  editRefused: false,
  editHint: '',
  directory: { status: 'none' },
  missing: true,
  suggestion: OTHER,
  mins: 0,
  safe: true,
  includePath: ENTRY,
  layout: 'doc',
  showRails: false,
} as unknown as GroveShell;

// ── The disk enumeration (G-CUST-3's "never a hand-list") ────────────────────
const COMPONENTS_DIR = join(__dirname);
const linkComponents = readdirSync(COMPONENTS_DIR)
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .filter((f) => /<Link\b|navigate\(/.test(readFileSync(join(COMPONENTS_DIR, f), 'utf8')))
  .map((f) => f.replace(/\.tsx$/, ''));

// Per-component minimal render context (props, and a sandboxPath when the
// component's content depends on which entry it renders inside).
const FIXTURES: Record<string, { props?: Record<string, unknown>; sandboxPath?: string }> = {
  WikiLink: { props: { href: '/wiki/b.mdx', children: 'the other' } },
  Search: { props: { onClose: () => {} } },
  Drawer: { props: { siteTitle: 'Fixture', nav: [{ key: OTHER, href: keyToHref(OTHER), label: 'Other', cur: false }], onClose: () => {} } },
  // ChildPages lists the current entry's INDEX siblings — the current entry must
  // be the namespace's index for the listing to have rows.
  ChildPages: { sandboxPath: '/app/content/wiki/index.mdx' },
  // DirectoryList reads the current entry's folder — the readdir mock answers it
  // (see beforeEach), and the rows link to entries the index knows.
  DirectoryList: { sandboxPath: '/app/content/wiki/index.mdx' },
};

// ── Harness ──────────────────────────────────────────────────────────────────
function Harness({ children, record, sandboxPath }: { children: ReactNode; record: (t: FollowLinkTarget) => void; sandboxPath?: string }) {
  return (
    <TinkerableContext.Provider
      value={{
        outerHref: 'https://immediately.run/x',
        navigationState: { ...NAV, sandboxPath: sandboxPath ?? NAV.sandboxPath },
        routingSpec: { routes: [] } as never,
        filesMetadata: META,
      } as never}
    >
      <GroveShellContext.Provider value={shell}>
        <NavigationPolicyContext.Provider value={record}>{children}</NavigationPolicyContext.Provider>
      </GroveShellContext.Provider>
    </TinkerableContext.Provider>
  );
}

async function renderAndClick(name: string, node: ReactNode): Promise<{ calls: FollowLinkTarget[]; prevented: boolean }> {
  const calls: FollowLinkTarget[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(
      <Harness
        record={(t) => {
          calls.push(t);
        }}
        sandboxPath={FIXTURES[name]?.sandboxPath}
      >
        {node}
      </Harness>,
    );
  });
  for (let i = 0; i < 8; i++) await act(async () => {});
  const anchor = container.querySelector('a[href]');
  expect(anchor, `${name} renders at least one link`).toBeTruthy();
  let prevented = false;
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
  Object.defineProperty(event, 'defaultPrevented', { get: () => prevented });
  await act(async () => {
    // dispatch through the real DOM path; the guard marks defaultPrevented
    const origPrevent = event.preventDefault.bind(event);
    event.preventDefault = () => {
      prevented = true;
      origPrevent();
    };
    anchor!.dispatchEvent(event);
  });
  await act(async () => {
    root.unmount();
  });
  container.remove();
  return { calls, prevented };
}

beforeEach(() => {
  readFile.mockReset();
  readFile.mockImplementation(async (p: unknown) =>
    // Backlinks scans bodies for links TO the rendered entry: b's body links a.
    String(p).endsWith('/b.mdx')
      ? '---\ntitle: B\nrender: safe\n---\n\n[the first](/wiki/a.mdx)\n'
      : '---\ntitle: T\nrender: safe\n---\n\nplain body\n',
  );
  readdirFs.mockReset();
  const dirent = (name: string, isDir = false) => ({ name, isDirectory: () => isDir });
  readdirFs.mockImplementation(async () => [dirent('c.mdx'), dirent('assets', true)]);
  void readdirFs;
});

describe('G-CUST-3 — every entry link rides the navigation policy', () => {
  it('the enumeration covers the known link components (non-vacuity)', () => {
    for (const name of ['WikiLink', 'Backlinks', 'ChildPages', 'Directory', 'DirectoryList', 'DirectoryView', 'DocList', 'Drawer', 'GroveFooter', 'GroveNav', 'PageView', 'Search', 'Sidebar', 'Timeline']) {
      expect(linkComponents, `${name} is enumerated`).toContain(name);
    }
  });

  it.each(linkComponents)('%s: a plain click reaches the policy with a resolved target', async (name) => {
    const mod = await import(`./${name}`);
    const Component = mod.default;
    const { calls, prevented } = await renderAndClick(name, <Component {...(FIXTURES[name]?.props ?? {})} />);
    expect(calls.length, `${name}: a plain click reaches the policy`).toBeGreaterThan(0);
    const t = calls[0];
    expect(typeof t.href, 'the target carries the concrete href').toBe('string');
    expect(t.href.length).toBeGreaterThan(0);
    expect(typeof t.key, 'the target carries the resolved key').toBe('string');
    expect(prevented, `${name}: the plain click prevents the browser default`).toBe(true);
  });
});
