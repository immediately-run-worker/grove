// @vitest-environment jsdom
// R3-872 (APP_CUSTOMIZATION §4.5) — the scoped branch of useHeadings, the one
// that shipped broken at the first review (the marker sits INSIDE .grove-prose,
// so a scoped `.grove-prose` lookup found nothing). These cases plant MARKED
// bodies — the shape the stock DOM always has — and assert the scoped read.
import { describe, it, expect, beforeAll } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useHeadings } from './useHeadings';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false, onchange: null }),
  });
});

const A = '/app/content/specs/a.mdx';
const B = '/app/content/specs/b.mdx';

/** Two marked bodies, each with its own headings — the multi-entry page shape
 *  (both paths carry the marker since R3-872, and the safe path's marker wraps
 *  the body inside .grove-prose, as EntryBody renders it). */
function plantTwoBodies() {
  // A carries one ID-LESS heading (the kernel assigns none sometimes) — B's scan
  // must never write an id onto it (the side effect is scoped, not just the read).
  document.body.innerHTML = `
    <div class="grove-prose"><div data-entry="${A}"><h2 id="sec-1">A one</h2><h2>A two (no id)</h2></div></div>
    <div class="grove-prose"><div data-entry="${B}"><h2 id="sec-1">B one</h2><h3 id="sec-2-1">B two-one</h3></div></div>
  `;
}

function Probe({ entryKey, seen }: { entryKey: string; seen: (h: { id: string }[]) => void }) {
  const heads = useHeadings(entryKey);
  seen(heads);
  return null;
}

describe('useHeadings — entry-scoped (R3-872)', () => {
  it("reads only the named entry's headings when both bodies are marked", async () => {
    plantTwoBodies();
    let latest: { id: string }[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe entryKey={B} seen={(h) => (latest = h)} />);
    });
    expect(latest.map((h) => h.id)).toEqual(['sec-1', 'sec-2-1']);
    // the OTHER entry's id-less heading stays id-less — the scan's id-assignment
    // side effect is scoped, not just the read
    expect(document.querySelector(`[data-entry="${A}"] h2:nth-of-type(2)`)?.id ?? '').toBe('');
    await act(async () => root.unmount());
    container.remove();
  });

  it('a late-committing marked body is found by the document observer (no empty ToC for life)', async () => {
    document.body.innerHTML = '';
    let latest: { id: string }[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe entryKey={B} seen={(h) => (latest = h)} />);
    });
    expect(latest).toEqual([]); // no marker yet — nothing found, not a wrong read
    // the body lands late (the compile window)
    await act(async () => {
      plantTwoBodies();
    });
    // the observer's mutation callback is async — flush it
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(latest.map((h) => h.id)).toEqual(['sec-1', 'sec-2-1']);
    await act(async () => root.unmount());
    container.remove();
  });

  it('no marked bodies anywhere → the document fallback (the pre-marker world)', async () => {
    document.body.innerHTML = '<div class="grove-prose"><h2 id="sec-1">Only one</h2></div>';
    let latest: { id: string }[] = [];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<Probe entryKey={B} seen={(h) => (latest = h)} />);
    });
    expect(latest.map((h) => h.id)).toEqual(['sec-1']);
    await act(async () => root.unmount());
    container.remove();
  });
});
