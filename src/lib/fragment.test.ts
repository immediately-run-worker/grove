import { describe, it, expect } from 'vitest';
import { fragmentOf, resolveFragmentTarget } from './fragment';

/** A minimal DOM stand-in: enough of `querySelectorAll('[data-entry]')` + scoped
 *  `querySelector` for what `resolveFragmentTarget` does. */
function makeDoc(bodies: { entry: string; ids: string[]; slugs?: string[] }[]): Document {
  const scopeFor = (b: { entry: string; ids: string[]; slugs?: string[] }) => ({
    getAttribute: (name: string) => (name === 'data-entry' ? b.entry : null),
    querySelector: (sel: string) => {
      const id = sel.match(/^\[id="(.*)"\]$/)?.[1];
      const slug = sel.match(/^\[data-slug="(.*)"\]$/)?.[1];
      if (id && b.ids.includes(id)) return { entry: b.entry, id, scrollIntoView() {} } as unknown as HTMLElement;
      if (slug && (b.slugs ?? []).includes(slug)) return { entry: b.entry, slug, scrollIntoView() {} } as unknown as HTMLElement;
      return null;
    },
  });
  const scopes = bodies.map(scopeFor);
  return {
    querySelectorAll: (sel: string) => (sel === '[data-entry]' ? scopes : []),
    // The no-marker fallback searches the whole document.
    querySelector: (sel: string) => {
      for (const s of scopes) {
        const hit = s.querySelector(sel);
        if (hit) return hit;
      }
      return null;
    },
  } as unknown as Document;
}

describe('fragmentOf', () => {
  it('strips the leading hash', () => {
    expect(fragmentOf('#sec-8-9')).toBe('sec-8-9');
    expect(fragmentOf('sec-8-9')).toBe('sec-8-9');
  });

  it('drops the local dev provider locator glued onto the fragment', () => {
    // `immediately.run dev` puts `#ir-endpoint=…&ir-token=…` on the URL, so a fragment can
    // arrive with the locator attached. Taking the whole string would look for an id
    // called `sec-4#ir-endpoint=…` and silently never scroll.
    expect(fragmentOf('#sec-4#ir-endpoint=http%3A%2F%2F127.0.0.1%3A7700&ir-token=abc')).toBe('sec-4');
    expect(fragmentOf('#sec-4&ir-token=abc')).toBe('sec-4');
  });

  it('is empty for no hash', () => {
    expect(fragmentOf('')).toBe('');
    expect(fragmentOf(undefined)).toBe('');
  });
});

describe('resolveFragmentTarget — the stale-document guard (R3-249)', () => {
  const OUTGOING = '/app/content/specs/PERSISTENCE_SPEC.mdx';
  const INCOMING = '/app/content/context/core_concepts.mdx';

  it('refuses to resolve while the PREVIOUS entry is still the one rendered', () => {
    // Both documents have a `sec-4` — the whole reason the bug exists. Asking for the
    // incoming entry's section while the outgoing body is on screen must yield nothing,
    // so the caller waits instead of scrolling to the wrong page's section.
    const doc = makeDoc([{ entry: OUTGOING, ids: ['sec-1', 'sec-4', 'sec-8'] }]);
    expect(resolveFragmentTarget(doc, INCOMING, 'sec-4')).toBeNull();
  });

  it('resolves once the incoming entry is the one rendered', () => {
    const doc = makeDoc([{ entry: INCOMING, ids: ['sec-1', 'sec-4'] }]);
    expect(resolveFragmentTarget(doc, INCOMING, 'sec-4')).not.toBeNull();
  });

  it('picks the section from the CURRENT entry when both bodies are in the DOM', () => {
    // The transition window: the outgoing body has not unmounted yet.
    const doc = makeDoc([
      { entry: OUTGOING, ids: ['sec-4'] },
      { entry: INCOMING, ids: ['sec-4'] },
    ]);
    const el = resolveFragmentTarget(doc, INCOMING, 'sec-4') as unknown as { entry: string };
    expect(el?.entry).toBe(INCOMING);
  });

  it('accepts a numbered heading by its prose slug too', () => {
    const doc = makeDoc([{ entry: INCOMING, ids: ['sec-4'], slugs: ['4-principal'] }]);
    expect(resolveFragmentTarget(doc, INCOMING, '4-principal')).not.toBeNull();
  });

  it('returns null for an unknown fragment, and for an empty one', () => {
    const doc = makeDoc([{ entry: INCOMING, ids: ['sec-4'] }]);
    expect(resolveFragmentTarget(doc, INCOMING, 'sec-99')).toBeNull();
    expect(resolveFragmentTarget(doc, INCOMING, '')).toBeNull();
  });
});

describe('G-CUST-4 — entry-scoped resolution on a multi-entry page (R3-872)', () => {
  const FIRST = '/app/content/specs/A_SPEC.mdx';
  const SECOND = '/app/content/specs/B_SPEC.mdx';

  it('two marked bodies, both with #sec-4 (one per render path — both carry data-entry since R3-872): scoping to the second lands in the second', () => {
    const doc = makeDoc([
      { entry: FIRST, ids: ['sec-4'] },
      { entry: SECOND, ids: ['sec-4'] },
    ]);
    const el = resolveFragmentTarget(doc, SECOND, 'sec-4') as unknown as { entry: string };
    expect(el?.entry).toBe(SECOND);
  });

  it('the document-wide fallback fires only when NO body is marked at all (pre-marker content)', () => {
    const doc = makeDoc([]);
    // no marked bodies → the fallback is the whole document (today's compiled-path
    // behavior for content that never renders the marked paths)
    expect(resolveFragmentTarget(doc, FIRST, 'sec-4')).toBeNull(); // nothing anywhere
  });
});
