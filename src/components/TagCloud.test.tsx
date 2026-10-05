// @vitest-environment jsdom
// TagCloud's render contract: chips carry a 0..1 `--tag-weight` and NO inline
// font-size (the pixel range is GroveApp.css's), the wrapper carries the
// --weighted modifier, and `limit` keeps the N most-used tags (a bad limit is
// ignored with one warning). Metadata is supplied through TinkerableContext, the
// way Sidebar.test.tsx supplies its map. The rendered pixel size itself is
// jsdom-untestable (no calc()/custom-property resolution) — that leg is R3-946.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';

const { default: TagCloud } = await import('./TagCloud');

// One tag on 191 entries (the real docs corpus's `bug` scale) and one on a
// single entry.
const FILES = {
  ...Object.fromEntries(
    Array.from({ length: 191 }, (_, i) => [`/app/content/e${i}.mdx`, { title: `E${i}`, tags: ['bug'] }]),
  ),
  '/app/content/single.mdx': { title: 'Single.', tags: ['doc'] },
};

const NAV = {
  outerHref: 'https://example.immediately.run/app/x',
  navigationState: {
    sandboxPath: '/app/x',
    provider: 'github',
    namespace: 'immediately-run',
    repository: 'docs',
    ref: 'main',
    hash: '',
    search: '',
  },
  routingSpec: {} as never,
  filesMetadata: FILES,
};

let mounted: { root: Root; container: HTMLElement } | null = null;

async function mountCloud(limit?: number): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <TinkerableContext.Provider value={NAV as never}>
        <TagCloud limit={limit} />
      </TinkerableContext.Provider>,
    );
  });
  mounted = { root, container };
  return container;
}

afterEach(() => {
  if (mounted) {
    act(() => mounted!.root.unmount());
    mounted!.container.remove();
    mounted = null;
  }
});

const chips = (container: HTMLElement): HTMLElement[] =>
  [...container.querySelectorAll('.grove-tag')] as HTMLElement[];

describe('TagCloud', () => {
  it('weights every chip between 0 and 1 with no inline font-size, on a --weighted wrapper', async () => {
    const container = await mountCloud();
    expect(container.querySelector('.grove-tagcloud')!.classList.contains('grove-tagcloud--weighted')).toBe(true);
    const all = chips(container);
    expect(all.length).toBe(2);
    const weights = all.map((chip) => Number.parseFloat(chip.style.getPropertyValue('--tag-weight')));
    for (const w of weights) {
      expect(Number.isFinite(w)).toBe(true);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    // Chips read alphabetically: `bug` (191 entries, the maximum) then `doc`
    // (one entry, the minimum).
    expect(weights).toEqual([1, 0]);
    for (const chip of all) expect(chip.style.fontSize).toBe('');
  });

  it('limit={1} renders only the most-used tag, still scaled against the corpus', async () => {
    const container = await mountCloud(1);
    const all = chips(container);
    expect(all.length).toBe(1);
    expect(all[0]!.textContent).toContain('bug');
    // Corpus-relative (not subset-relative): the corpus maximum keeps weight 1
    // under the limit — subset scaling would give it min === max → 0.
    expect(all[0]!.style.getPropertyValue('--tag-weight')).toBe('1');
  });

  it('limit={0} is treated as absent and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = await mountCloud(0);
    expect(chips(container).length).toBe(2);
    expect(warn.mock.calls.length).toBe(1);
    expect(String(warn.mock.calls[0]![0])).toContain('0');
    warn.mockRestore();
  });
});
