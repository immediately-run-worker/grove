// @vitest-environment jsdom
// R3-871 — a relative asset src resolves against the ENTRY CONTEXT's entry
// directory, not the URL. The URL routes home while the provider says the
// subtree renders teams/engineering.mdx: the mount-relative path handed to
// MountImage must start from engineering's directory.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';
import { TinkerableContext } from '@immediately-run/sdk/TinkerableContext';
import { resetContentRoot, setContentRoot } from '../lib/contentRoot';

// The fs slice MountImage reads; the assertion target is the relPath it is
// HANDED, so the double only needs to serve bytes.
const readFile = vi.fn(async (relPath: string): Promise<Uint8Array> => {
    void relPath;
    return new Uint8Array([1]);
  });
(globalThis as { __sandpackSharedFs?: unknown }).__sandpackSharedFs = {
  promises: { readFile: (relPath: string) => readFile(relPath) },
};

const { default: AssetImage } = await import('./AssetImage');
const { EntryContext } = await import('../hooks/useEntryKey');

function host(children: ReactNode, entryKey?: string) {
  const value = {
    navigationState: { mode: 'present', sandboxPath: '/files/content/home.mdx', hash: '', search: '' },
    routingSpec: { routes: [] },
    filesMetadata: { '/app/content/home.mdx': { title: 'Home' } },
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

describe('AssetImage — the base is the entry context (R3-871)', () => {
  beforeEach(() => {
    setContentRoot('/app/content/');
    return () => resetContentRoot();
  });

  it('a relative src inside a non-routed entry resolves against that entry\'s directory', async () => {
    await render(host(<AssetImage src="posters/ada.png" alt="Ada" />, '/app/content/teams/engineering.mdx'));
    expect(readFile).toHaveBeenCalled();
    const relPath = (readFile.mock.calls[0] as unknown[])[0] as string;
    expect(relPath).toBe('/app/content/teams/posters/ada.png');
  });

  it('with no provider, the routed entry (home) is the base — the default preserved', async () => {
    readFile.mockClear();
    await render(host(<AssetImage src="posters/ada.png" alt="Ada" />));
    const relPath = (readFile.mock.calls[0] as unknown[])[0] as string;
    expect(relPath).toBe('/app/content/posters/ada.png');
  });
});
