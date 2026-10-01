// @vitest-environment jsdom
// R3-871 — WikiLink resolves against the entry it renders inside, not the URL.
// The URL routes to content/home.mdx while an EntryContext provider says this
// subtree renders content/teams/engineering.mdx: a relative link must resolve
// from engineering's directory, and "self" must be judged against engineering.
// Keys come from the real key grammar (sandboxPathToKey/hrefKeyCandidates), the
// same fixtures shape the other component tests use.
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { resetContentRoot, setContentRoot } from '../lib/contentRoot';

const { default: WikiLink } = await import('./WikiLink');
const { EntryContext } = await import('../hooks/useEntryKey');

const METADATA = {
  '/app/content/home.mdx': { title: 'Home' },
  '/app/content/teams/engineering.mdx': { title: 'Engineering' },
  '/app/content/people/ada-lovelace.mdx': { title: 'Ada Lovelace' },
};

/** The URL routes HOME; the provider (when given) says which entry we render. */
function host(children: ReactNode, entryKey?: string, sandboxPath = '/files/content/home.mdx') {
  const value = {
    outerHref: 'https://immediately.run/present/github/o/r/main/files/content/home.mdx',
    navigationState: { mode: 'present', namespace: 'github', provider: 'github', repository: 'o/r', ref: 'main', sandboxPath, hash: '', search: '' },
    routingSpec: { routes: [] },
    filesMetadata: METADATA,
  };
  const inner = <TinkerableContext.Provider value={value as never}>{children}</TinkerableContext.Provider>;
  return entryKey === undefined ? inner : <EntryContext.Provider value={{ entryKey }}>{inner}</EntryContext.Provider>;
}

async function render(node: ReactNode): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    createRoot(container).render(node);
  });
  return container;
}

describe('WikiLink — the entry context decides the base (R3-871)', () => {
  beforeEach(() => {
    setContentRoot('/app/content/');
    return () => resetContentRoot();
  });

  it('a relative link inside a non-routed entry resolves against that entry', async () => {
    // the URL routes home; the subtree renders engineering (teams/engineering.mdx).
    const el = await render(
      host(
        <WikiLink href="../people/ada-lovelace.mdx">Ada</WikiLink>,
        '/app/content/teams/engineering.mdx',
      ),
    );
    const link = el.querySelector('.grove-wikilink') as HTMLElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('data-state')).toBe('ok');
    expect(link.getAttribute('href')).toContain('people/ada-lovelace.mdx');
  });

  it('the same relative link with no provider resolves against the routed entry (home)', async () => {
    // From home/, ../people/ada-lovelace.mdx lands outside the corpus → broken.
    // This is the default-preserving seam: same input, different base, by design.
    const el = await render(host(<WikiLink href="../people/ada-lovelace.mdx">Ada</WikiLink>));
    const link = el.querySelector('.grove-wikilink') as HTMLElement;
    expect(link.getAttribute('data-state')).toBe('broken');
  });

  it('a link to the context entry\'s own entry is self — judged against the entry, not the URL', async () => {
    const el = await render(
      host(
        <WikiLink href="engineering.mdx">this very page</WikiLink>,
        '/app/content/teams/engineering.mdx',
      ),
    );
    const link = el.querySelector('.grove-wikilink') as HTMLElement;
    expect(link.getAttribute('data-state')).toBe('self');
  });
});
